import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { RESERVED_SLUGS, SLUG_MIN, SLUG_MAX, SLUG_RE } from '$lib/slug';

// Live availability check for a public slug during project CREATION (no project id
// yet). Slugs are unique per-admin (unique index on (admin_id, public_slug)), so a
// plain RLS-scoped read is exactly right: the RLS policy limits `projects` to this
// admin's own rows, so a hit means THIS admin already uses the slug. We don't need
// the cross-admin security-definer RPC the edit flow uses — per-admin visibility is
// the whole question here. The unique index stays the authoritative guard at write.
//
// Returns `{ available, valid }`. `valid=false` means the slug fails the format rules.
const slugSchema = z
	.string()
	.min(SLUG_MIN)
	.max(SLUG_MAX)
	.regex(SLUG_RE)
	.refine((s) => !RESERVED_SLUGS.includes(s));

export const GET: RequestHandler = async ({ url, locals }) => {
	if (locals.user?.role !== 'admin' || !locals.supabase) {
		return json({ message: 'Not authorized.' }, { status: 403 });
	}

	const raw = (url.searchParams.get('slug') ?? '').trim().toLowerCase();
	const parsed = slugSchema.safeParse(raw);
	if (!parsed.success) {
		return json({ valid: false, available: false });
	}

	const { data, error } = await locals.supabase
		.from('projects')
		.select('id')
		.eq('public_slug', parsed.data)
		.maybeSingle();

	if (error) {
		console.error('[projects] create-flow slug availability check failed:', error);
		return json({ message: 'Could not check that link. Please try again.' }, { status: 500 });
	}

	return json({ valid: true, available: data === null });
};
