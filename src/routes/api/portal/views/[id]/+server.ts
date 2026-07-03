import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';

// Move a visit's exit time forward. `last_seen_at` doubles as the exit stamp
// (duration = last_seen_at − started_at), so both handlers just set it to now():
//   - PATCH: the ~20s heartbeat while the tab is visible.
//   - POST:  the definitive exit stamp fired via navigator.sendBeacon on pagehide
//            (a beacon can only POST, never PATCH).
// Client-only; RLS (`portal_views_client_update`) limits the update to the caller's
// own rows. We set the timestamp server-side (now()) rather than trusting a client
// clock. No `.select()` → no read policy needed.
async function stampLastSeen(
	locals: App.Locals,
	id: string
): Promise<{ status: number; body?: unknown }> {
	if (locals.user?.role !== 'client' || !locals.supabase) {
		return { status: 403, body: { message: 'Not authorized.' } };
	}

	if (!z.uuid().safeParse(id).success) {
		return { status: 400, body: { message: 'Invalid view id.' } };
	}

	const { error } = await locals.supabase
		.from('portal_views')
		.update({ last_seen_at: new Date().toISOString() })
		.eq('id', id);

	if (error) {
		console.error('[portal-views] heartbeat failed:', error);
		return { status: 500, body: { message: 'Could not update the visit.' } };
	}

	// Idempotent pulse — nothing to return. If the row wasn't the caller's, RLS
	// simply matched no rows (no error); the next POST re-establishes tracking.
	return { status: 204 };
}

export const PATCH: RequestHandler = async ({ params, locals }) => {
	const { status, body } = await stampLastSeen(locals, params.id ?? '');
	return body ? json(body, { status }) : new Response(null, { status });
};

export const POST: RequestHandler = async ({ params, locals }) => {
	const { status, body } = await stampLastSeen(locals, params.id ?? '');
	return body ? json(body, { status }) : new Response(null, { status });
};
