import { error } from '@sveltejs/kit';
import { supabaseAnon } from '$lib/server/supabase-anon';
import { computeOverallProgress } from '$lib/progress';
import { deriveProjectStatus } from '$lib/portal/journey';
import type { Milestone, PublicBranding, PublicJourney } from '$lib/portal/types';
import type { LayoutServerLoad } from './$types';

// Login-less public journey. Loaded on the server (SSR) so the shareable link
// renders instantly, gets a real <title>, and needs no client-side auth. The only
// data source is the `get_public_journey` RPC, which is hard-gated on
// `is_public = true` and strips sensitive `required_action` text — RLS on the
// underlying tables stays fully closed to anonymous callers.
//
// Shared by the journey page and the milestone drill-down (both under this
// layout), so the whole journey is fetched exactly once per visit.

// Raw milestone shape the RPC returns (includes the weight/scope fields needed to
// derive overall progress the same way the admin + portal do).
type RawMilestone = Milestone & { weight: number; scope_finalized: boolean };

type RawJourney = {
	id: string;
	name: string;
	status: PublicJourney['status'];
	expected_delivery_date: string | null;
	current_focus_title: string | null;
	current_focus_goal: string | null;
	created_at: string;
	updated_at: string;
	branding: PublicBranding | null;
	milestones: RawMilestone[];
};

export const load: LayoutServerLoad = async ({ params, depends }) => {
	// Tag this load so the public shell can re-run it on a timer (live updates):
	// `invalidate('public:journey')` re-fetches the RPC and refreshes the page.
	depends('public:journey');

	const { data, error: rpcError } = await supabaseAnon.rpc('get_public_journey', {
		p_slug: params.slug
	});

	if (rpcError) {
		console.error('[public] journey fetch failed:', rpcError);
		throw error(500, 'Could not load this project.');
	}
	if (!data) {
		// No public project for this slug (missing, or sharing turned off).
		throw error(404, 'This project link is not available.');
	}

	const raw = data as unknown as RawJourney;
	const rawMilestones = raw.milestones ?? [];

	// Drop the internal weight/scope fields; the client only needs the display shape.
	const milestones: Milestone[] = rawMilestones.map((m) => ({
		id: m.id,
		name: m.name,
		status: m.status,
		progress: m.progress,
		position: m.position,
		start_date: m.start_date,
		expected_completion_date: m.expected_completion_date,
		overview: m.overview,
		updated_at: m.updated_at,
		timeline_updates: m.timeline_updates ?? []
	}));

	const journey: PublicJourney = {
		id: raw.id,
		name: raw.name,
		// Auto-derived from milestones + timeline signals — the stored column is ignored.
		status: deriveProjectStatus(rawMilestones),
		expected_delivery_date: raw.expected_delivery_date,
		current_focus_title: raw.current_focus_title,
		current_focus_goal: raw.current_focus_goal,
		created_at: raw.created_at,
		updated_at: raw.updated_at,
		progress: computeOverallProgress(rawMilestones),
		milestones,
		branding: raw.branding ?? null
	};

	return { journey };
};
