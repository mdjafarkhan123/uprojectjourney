import { json, type RequestHandler } from '@sveltejs/kit';

// Admin Reporting read API. Returns this admin's VISITS — one row per visit — for
// BOTH surfaces:
//   - source = 'portal': a logged-in client's whole stay in their portal (has a
//     client, no project — they roam the whole portal).
//   - source = 'public': an anonymous visit to a shared public link (no client,
//     but carries the specific project that was shared).
// A visit is a pure session log: started_at = entry, last_seen_at = exit/last
// activity, and duration = last_seen_at − started_at (derived here, never stored).
//
// Admin-only. RLS (`portal_views_admin_select`) already scopes rows to this admin
// (admin_id = auth.uid()), so no extra `.eq` is needed. `portal_views` has TWO FKs
// to `users` (client_id, admin_id), so the client embed is disambiguated by FK name.
// The select MUST stay a single string literal — concatenating with `+` widens it to
// `string`, which makes supabase-js infer a GenericStringError and breaks the types.

// Keep the payload bounded for V1: the last 90 days, newest first, capped.
const WINDOW_DAYS = 90;
const ROW_LIMIT = 500;

type ReportingRow = {
	id: string;
	source: 'portal' | 'public';
	client_id: string | null;
	client_name: string | null;
	project_name: string | null;
	started_at: string;
	last_seen_at: string;
	duration_seconds: number;
};

export const GET: RequestHandler = async ({ locals }) => {
	if (locals.user?.role !== 'admin' || !locals.supabase) {
		return json({ message: 'Not authorized.' }, { status: 403 });
	}

	const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

	const { data, error } = await locals.supabase
		.from('portal_views')
		.select(
			'id, source, client_id, started_at, last_seen_at, client:users!portal_views_client_id_fkey(full_name), project:projects(name)'
		)
		.gte('started_at', since)
		.order('started_at', { ascending: false })
		.limit(ROW_LIMIT);

	if (error) {
		console.error('[reporting] visit fetch failed:', error);
		return json({ message: 'Could not load reporting data.' }, { status: 500 });
	}

	const views: ReportingRow[] = (data ?? []).map((row) => {
		// Embedded to-one relations come back as an object (or null if RLS-hidden or
		// the referenced row was deleted before the FK cascade — defensive). Public
		// visits have no client; portal visits have no project.
		const client = row.client as { full_name: string } | null;
		const project = row.project as { name: string } | null;

		const startedMs = new Date(row.started_at).getTime();
		const lastSeenMs = new Date(row.last_seen_at).getTime();
		// Clamp to ≥0: a heartbeat can only move last_seen_at forward, but guard
		// against clock skew so a stray negative never reaches the charts.
		const durationSeconds = Math.max(0, Math.round((lastSeenMs - startedMs) / 1000));

		return {
			id: row.id,
			source: row.source === 'public' ? 'public' : 'portal',
			client_id: row.client_id,
			client_name: client?.full_name ?? null,
			project_name: project?.name ?? null,
			started_at: row.started_at,
			last_seen_at: row.last_seen_at,
			duration_seconds: durationSeconds
		};
	});

	return json({ views });
};
