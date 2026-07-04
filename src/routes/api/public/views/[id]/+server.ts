import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { supabaseAnon } from '$lib/server/supabase-anon';

// Move a PUBLIC visit's exit time forward. `last_seen_at` doubles as the exit
// stamp (duration = last_seen_at − started_at), so both handlers just push it to
// now() via the `touch_public_view` RPC:
//   - PATCH: the ~20s heartbeat while the tab is visible.
//   - POST:  the definitive exit stamp fired via navigator.sendBeacon on pagehide
//            (a beacon can only POST, never PATCH).
// The view id is an unguessable UUID handed only to that visitor (same trust model
// as the public slug), and the RPC is scoped to `source = 'public'`, so it can
// never touch a logged-in client's row.
async function touch(id: string): Promise<{ status: number; body?: unknown }> {
	if (!z.uuid().safeParse(id).success) {
		return { status: 400, body: { message: 'Invalid view id.' } };
	}

	const { error } = await supabaseAnon.rpc('touch_public_view', { p_view_id: id });
	if (error) {
		console.error('[public-views] heartbeat failed:', error);
		return { status: 500, body: { message: 'Could not update the visit.' } };
	}

	return { status: 204 };
}

export const PATCH: RequestHandler = async ({ params }) => {
	const { status, body } = await touch(params.id ?? '');
	return body ? json(body, { status }) : new Response(null, { status });
};

export const POST: RequestHandler = async ({ params }) => {
	const { status, body } = await touch(params.id ?? '');
	return body ? json(body, { status }) : new Response(null, { status });
};
