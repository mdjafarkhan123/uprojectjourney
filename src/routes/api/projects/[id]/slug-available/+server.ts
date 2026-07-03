import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';

// Live availability check for a public slug, used by the Edit-project modal as the
// admin types. Backed by the `is_slug_available` security-definer RPC so it can see
// across ALL admins' slugs (RLS would otherwise hide other admins' rows and report a
// taken slug as free). The unique index remains the authoritative guard at write time.
//
// Returns `{ available, valid }`. `valid=false` means the slug fails the format rules,
// so availability is moot.
const RESERVED_SLUGS = ['master', 'api', 'p', 'journey'];
const slugSchema = z
	.string()
	.min(3)
	.max(40)
	.regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
	.refine((s) => !RESERVED_SLUGS.includes(s));

export const GET: RequestHandler = async ({ params, url, locals }) => {
	if (locals.user?.role !== 'admin' || !locals.supabase) {
		return json({ message: 'Not authorized.' }, { status: 403 });
	}

	const id = params.id ?? '';
	if (!z.uuid().safeParse(id).success) {
		return json({ message: 'Invalid project id.' }, { status: 400 });
	}

	const raw = (url.searchParams.get('slug') ?? '').trim().toLowerCase();
	const parsed = slugSchema.safeParse(raw);
	if (!parsed.success) {
		return json({ valid: false, available: false });
	}

	const { data, error } = await locals.supabase.rpc('is_slug_available', {
		p_slug: parsed.data,
		p_project_id: id
	});

	if (error) {
		console.error('[projects] slug availability check failed:', error);
		return json({ message: 'Could not check that link. Please try again.' }, { status: 500 });
	}

	return json({ valid: true, available: data === true });
};
