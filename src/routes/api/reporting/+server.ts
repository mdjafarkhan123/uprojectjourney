import { json, type RequestHandler } from '@sveltejs/kit';

// Admin Reporting read API. Returns this admin's portal VISITS — one row per visit
// (a client's whole stay in the portal), joined to the client's name. A visit is a
// pure session log: started_at = entry, last_seen_at = exit/last activity, and
// duration = last_seen_at − started_at (derived here, never stored). There is no
// per-project / per-milestone dimension anymore.
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
	client_id: string;
	client_name: string;
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
			'id, client_id, started_at, last_seen_at, client:users!portal_views_client_id_fkey(full_name)'
		)
		.gte('started_at', since)
		.order('started_at', { ascending: false })
		.limit(ROW_LIMIT);

	if (error) {
		console.error('[reporting] visit fetch failed:', error);
		return json({ message: 'Could not load reporting data.' }, { status: 500 });
	}

	const views: ReportingRow[] = (data ?? []).map((row) => {
		// Embedded to-one relation comes back as an object (or null if RLS-hidden or
		// the referenced row was deleted before the FK cascade — defensive).
		const client = row.client as { full_name: string } | null;

		const startedMs = new Date(row.started_at).getTime();
		const lastSeenMs = new Date(row.last_seen_at).getTime();
		// Clamp to ≥0: a heartbeat can only move last_seen_at forward, but guard
		// against clock skew so a stray negative never reaches the charts.
		const durationSeconds = Math.max(0, Math.round((lastSeenMs - startedMs) / 1000));

		return {
			id: row.id,
			client_id: row.client_id,
			client_name: client?.full_name ?? '—',
			started_at: row.started_at,
			last_seen_at: row.last_seen_at,
			duration_seconds: durationSeconds
		};
	});

	return json({ views });
};
