import { json, type RequestHandler } from '@sveltejs/kit';
import { computeOverallProgress } from '$lib/progress';
import { deriveProjectStatus } from '$lib/portal/journey';

// Client-facing read of the logged-in client's project journey. Read-only.
// RLS (`projects_client_select` → client_id = auth.uid(), with milestones /
// timeline_updates following the parent project) does the isolation, so we never
// filter by client id in app code — a client simply cannot see another's rows.
//
// Progress is DERIVED — a weighted, draft-aware blend of milestone progress (see
// $lib/progress), never stored — same rule as the admin side. Clients never see the
// "scope" concept; a draft milestone simply reads as 0% until the admin finalizes
// it. Everything else the portal needs to answer the four at-a-glance questions is
// derived on the client from the milestone + timeline data returned here.

type TimelineStatus =
	'not_started' | 'in_progress' | 'waiting_for_client' | 'under_review' | 'completed';

type LinkRow = { id: string; url: string; label: string; position: number };

type TimelineUpdateRow = {
	id: string;
	title: string;
	description: string | null;
	status: TimelineStatus;
	required_action: string | null;
	entry_date: string;
	created_at: string;
	started_at: string | null;
	completed_at: string | null;
	// PostgREST names the embedded rows after the table; we re-key to `links` below.
	timeline_update_links: LinkRow[];
};

type MilestoneRow = {
	id: string;
	name: string;
	status: 'not_started' | 'open' | 'in_progress' | 'completed';
	progress: number;
	weight: number;
	scope_finalized: boolean;
	position: number;
	start_date: string | null;
	expected_completion_date: string | null;
	overview: string | null;
	updated_at: string;
	timeline_updates: TimelineUpdateRow[];
};

// Oldest entry first; break same-day ties by creation time so ordering is stable
// (mirrors the admin project GET so both views agree). Also re-keys each update's
// embedded links to `links` and orders them by position.
function normalizeTimeline(updates: TimelineUpdateRow[]) {
	return [...updates]
		.sort((a, b) => {
			if (a.entry_date !== b.entry_date) return a.entry_date < b.entry_date ? -1 : 1;
			return a.created_at < b.created_at ? -1 : 1;
		})
		.map(({ timeline_update_links, ...u }) => ({
			...u,
			links: [...(timeline_update_links ?? [])].sort((a, b) => a.position - b.position)
		}));
}

export const GET: RequestHandler = async ({ locals }) => {
	if (locals.user?.role !== 'client' || !locals.supabase) {
		return json({ message: 'Not authorized.' }, { status: 403 });
	}

	const { data, error } = await locals.supabase
		.from('projects')
		.select(
			'id, name, status, expected_delivery_date, current_focus_title, current_focus_goal, created_at, updated_at, milestones(id, name, status, progress, weight, scope_finalized, position, start_date, expected_completion_date, overview, updated_at, timeline_updates(id, title, description, status, required_action, entry_date, created_at, started_at, completed_at, timeline_update_links(id, url, label, position)))'
		)
		.order('created_at', { ascending: false })
		.order('position', { referencedTable: 'milestones', ascending: true });

	if (error) {
		console.error('[portal] projects fetch failed:', error);
		return json({ message: 'Could not load your projects.' }, { status: 500 });
	}

	const projects = (data ?? []).map((p) => {
		const milestones = ((p.milestones ?? []) as MilestoneRow[]).map((m) => ({
			...m,
			timeline_updates: normalizeTimeline(m.timeline_updates ?? [])
		}));
		return {
			id: p.id,
			name: p.name,
			// Auto-derived from milestones + timeline signals — the stored column is ignored.
			status: deriveProjectStatus(milestones),
			expected_delivery_date: p.expected_delivery_date,
			current_focus_title: p.current_focus_title,
			current_focus_goal: p.current_focus_goal,
			created_at: p.created_at,
			updated_at: p.updated_at,
			progress: computeOverallProgress(milestones),
			milestones
		};
	});

	return json({ projects });
};
