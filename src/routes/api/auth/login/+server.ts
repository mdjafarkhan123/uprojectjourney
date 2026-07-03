import { json, type RequestHandler } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { z } from 'zod';
import { supabaseAdmin } from '$lib/server/supabase-admin';
import { verifyPassword } from '$lib/server/password';
import { createSession, SESSION_COOKIE } from '$lib/server/session';

const loginSchema = z.object({
	// Admins may sign in with either their username or their email; clients only
	// ever have a username. We branch on the presence of "@" to pick the column.
	identifier: z.string().trim().min(1).max(255),
	password: z.string().min(1).max(256),
	// Which login surface the request came from. The user's actual role must
	// match, so a client can't sign in through the admin page or vice versa.
	intent: z.enum(['admin', 'client'])
});

/** Generic credential failure — deliberately vague to avoid user enumeration. */
const invalid = () => json({ message: 'Invalid username or password.' }, { status: 401 });

export const POST: RequestHandler = async ({ request, cookies }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ message: 'Invalid request body.' }, { status: 400 });
	}

	const parsed = loginSchema.safeParse(body);
	if (!parsed.success) {
		return json({ message: 'Invalid request body.' }, { status: 400 });
	}
	const { identifier, password, intent } = parsed.data;

	// An "@" means it can only be an email (usernames are restricted to
	// letters/numbers/. _ -). Emails are stored and indexed case-insensitively.
	const byEmail = identifier.includes('@');
	const query = supabaseAdmin.from('users').select('id, role, status, password_hash');
	const { data: user, error } = await (
		byEmail ? query.eq('email', identifier.toLowerCase()) : query.eq('username', identifier)
	).maybeSingle();

	if (error) {
		console.error('[login] user lookup failed:', error);
		return json({ message: 'Something went wrong. Please try again.' }, { status: 500 });
	}

	// Same generic response whether the user is missing, the password is wrong,
	// the account is inactive, or the role doesn't match the login surface.
	if (!user || user.status !== 'active' || user.role !== intent) {
		// Still verify against a hash when we have one, to keep timing consistent.
		if (user) await verifyPassword(user.password_hash, password).catch(() => false);
		return invalid();
	}

	const ok = await verifyPassword(user.password_hash, password).catch(() => false);
	if (!ok) return invalid();

	const { token, expiresAt } = await createSession(user.id);

	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		secure: !dev,
		sameSite: 'lax',
		expires: expiresAt
	});

	return json({ redirectTo: user.role === 'admin' ? '/master' : '/' });
};
