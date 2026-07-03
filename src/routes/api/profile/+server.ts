import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { hashPassword } from '$lib/server/password';

// Edit the signed-in admin's own profile. Writes go through the RLS-enforced
// client, whose users policies allow an admin to update their own row
// (id = auth.uid()). Changing the password does NOT invalidate the current
// session — the admin stays signed in.
const patchSchema = z
	.object({
		fullName: z.string().trim().min(1, 'Full name is required.').max(120).optional(),
		username: z
			.string()
			.trim()
			.min(3, 'Username must be at least 3 characters.')
			.max(64)
			.regex(/^[a-zA-Z0-9._-]+$/, 'Use only letters, numbers, and . _ -')
			.optional(),
		password: z.string().min(8, 'Password must be at least 8 characters.').max(256).optional()
	})
	.refine((obj) => Object.keys(obj).length > 0, { message: 'Nothing to update.' });

export const PATCH: RequestHandler = async ({ request, locals }) => {
	if (locals.user?.role !== 'admin' || !locals.supabase) {
		return json({ message: 'Not authorized.' }, { status: 403 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ message: 'Invalid request body.' }, { status: 400 });
	}

	const parsed = patchSchema.safeParse(body);
	if (!parsed.success) {
		return json(
			{
				message: 'Please check the form and try again.',
				errors: z.flattenError(parsed.error).fieldErrors
			},
			{ status: 400 }
		);
	}
	const input = parsed.data;

	const update: { full_name?: string; username?: string; password_hash?: string } = {};
	if (input.fullName !== undefined) update.full_name = input.fullName;
	if (input.username !== undefined) update.username = input.username;
	if (input.password !== undefined) update.password_hash = await hashPassword(input.password);

	const { data, error } = await locals.supabase
		.from('users')
		.update(update)
		.eq('id', locals.user.id)
		.eq('role', 'admin')
		.select('id, full_name, username')
		.maybeSingle();

	if (error) {
		// Unique violation on username → friendly field error, not a 500.
		if (error.code === '23505') {
			return json(
				{
					message: 'That username is already taken.',
					errors: { username: ['That username is already taken.'] }
				},
				{ status: 409 }
			);
		}
		console.error('[profile] update failed:', error);
		return json({ message: 'Could not save your profile. Please try again.' }, { status: 500 });
	}
	if (!data) {
		return json({ message: 'Profile not found.' }, { status: 404 });
	}

	return json({ profile: data });
};
