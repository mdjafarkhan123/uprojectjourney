import { json, type RequestHandler } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';

// Start a client's portal VISIT. A "view" is now one whole visit (a session):
// `started_at` is the entry time, `last_seen_at` is the exit / last-activity time,
// and duration = last_seen_at − started_at. Navigating around inside the portal
// during the visit is the SAME view — the client resumes it (see track.ts). The
// heartbeat PATCH and the sendBeacon POST on [id] keep `last_seen_at` fresh.
//
// Client-only. `admin_id` is the client's `owner_admin_id` (carried on the session,
// not trusted from the request) — it's what the admin's Reporting queries on. There
// is no per-page dimension anymore, so the body is empty.
export const POST: RequestHandler = async ({ locals }) => {
	if (locals.user?.role !== 'client' || !locals.supabase) {
		return json({ message: 'Not authorized.' }, { status: 403 });
	}

	const adminId = locals.user.ownerAdminId;
	if (!adminId) {
		// A client with no owning admin can't be attributed — nothing to record.
		return json({ message: 'No owning admin for this client.' }, { status: 409 });
	}

	// Generate the id here rather than using `.select()` to read it back: an
	// INSERT ... RETURNING would require a client SELECT policy on portal_views,
	// which doesn't exist (clients are write-only on this table). A plain insert
	// only evaluates the INSERT WITH CHECK, which the client satisfies.
	const id = randomUUID();
	const { error } = await locals.supabase.from('portal_views').insert({
		id,
		client_id: locals.user.id,
		admin_id: adminId
	});

	if (error) {
		console.error('[portal-views] insert failed:', error);
		return json({ message: 'Could not record the visit.' }, { status: 500 });
	}

	return json({ id }, { status: 201 });
};
