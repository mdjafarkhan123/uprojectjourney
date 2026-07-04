import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { supabaseAnon } from '$lib/server/supabase-anon';

// Start a login-less PUBLIC visit to a shared journey (`/p/[username]/[slug]`).
// Public viewers are anonymous — RLS on portal_views stays fully closed to them,
// so the write goes through the `record_public_view` SECURITY DEFINER RPC (the
// same anonymous-entry pattern as `get_public_journey`). The RPC is hard-gated on
// `is_public = true` and attributes the visit to the project + its owning admin.
//
// Mirrors the logged-in portal visit model: this creates the row (entry), then the
// heartbeat/beacon on [id] keeps `last_seen_at` (the exit time) fresh. No auth —
// these routes are reachable by anyone, but they can only ever touch a project
// that is actually public.

const bodySchema = z.object({
	username: z.string().min(1).max(60),
	slug: z.string().min(1).max(60)
});

export const POST: RequestHandler = async ({ request }) => {
	let parsed: z.infer<typeof bodySchema>;
	try {
		parsed = bodySchema.parse(await request.json());
	} catch {
		return json({ message: 'Invalid request.' }, { status: 400 });
	}

	const { data, error } = await supabaseAnon.rpc('record_public_view', {
		p_username: parsed.username,
		p_slug: parsed.slug
	});

	if (error) {
		console.error('[public-views] record failed:', error);
		return json({ message: 'Could not record the visit.' }, { status: 500 });
	}

	// RPC returns null when there's no public project for this username/slug
	// (missing, or sharing turned off) — nothing to track, but not an error.
	if (!data) {
		return json({ message: 'No public project.' }, { status: 404 });
	}

	return json({ id: data }, { status: 201 });
};
