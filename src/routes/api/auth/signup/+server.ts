import { json, type RequestHandler } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { z } from 'zod';
import { supabaseAdmin } from '$lib/server/supabase-admin';
import { hashPassword } from '$lib/server/password';
import { createSession, SESSION_COOKIE } from '$lib/server/session';
import { seedDefaultTemplatesForAdmin } from '$lib/server/default-templates';

// Public admin self-signup. No email verification (V1 override). Runs with the
// service-role client because the caller is unauthenticated — RLS on `users`
// would otherwise reject the insert. We create a new admin (owner_admin_id null)
// and immediately open a session so they land straight in the dashboard.
const signupSchema = z.object({
	fullName: z.string().trim().min(1, 'Full name is required.').max(120),
	email: z.string().trim().toLowerCase().email('Enter a valid email address.').max(255),
	username: z
		.string()
		.trim()
		.min(3, 'Username must be at least 3 characters.')
		.max(64)
		.regex(/^[a-zA-Z0-9._-]+$/, 'Use only letters, numbers, and . _ -'),
	password: z.string().min(8, 'Password must be at least 8 characters.').max(256)
});

export const POST: RequestHandler = async ({ request, cookies }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ message: 'Invalid request body.' }, { status: 400 });
	}

	const parsed = signupSchema.safeParse(body);
	if (!parsed.success) {
		return json(
			{
				message: 'Please check the form and try again.',
				errors: z.flattenError(parsed.error).fieldErrors
			},
			{ status: 400 }
		);
	}
	const { fullName, email, username, password } = parsed.data;

	const passwordHash = await hashPassword(password);

	const { data: user, error } = await supabaseAdmin
		.from('users')
		.insert({
			role: 'admin',
			owner_admin_id: null,
			username,
			email,
			full_name: fullName,
			password_hash: passwordHash,
			status: 'active'
		})
		.select('id, role')
		.single();

	if (error) {
		// Unique violation on username or email → friendly field error, not a 500.
		if (error.code === '23505') {
			const field = error.message.includes('email') ? 'email' : 'username';
			const label = field === 'email' ? 'email' : 'username';
			return json(
				{
					message: `That ${label} is already taken.`,
					errors: { [field]: [`That ${label} is already taken.`] }
				},
				{ status: 409 }
			);
		}
		console.error('[signup] create failed:', error);
		return json({ message: 'Could not create your account. Please try again.' }, { status: 500 });
	}

	// Seed this admin's private, editable copies of the default templates.
	// Non-fatal: a seeding hiccup must not block account creation — they can be
	// backfilled — so we log and continue rather than 500 the signup.
	try {
		await seedDefaultTemplatesForAdmin(supabaseAdmin, user.id);
	} catch (seedErr) {
		console.error('[signup] template seeding failed for', user.id, seedErr);
	}

	const { token, expiresAt } = await createSession(user.id);

	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		secure: !dev,
		sameSite: 'lax',
		expires: expiresAt
	});

	return json({ redirectTo: '/master' }, { status: 201 });
};
