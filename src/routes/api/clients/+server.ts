import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { hashPassword } from '$lib/server/password';

// List this admin's clients. Reads go through the RLS-enforced client, so the
// rows are already scoped to the caller. Content is fetched client-side (CSR),
// so the page can render a skeleton first and cache the result.
export const GET: RequestHandler = async ({ locals }) => {
	if (locals.user?.role !== 'admin' || !locals.supabase) {
		return json({ message: 'Not authorized.' }, { status: 403 });
	}

	const { data, error } = await locals.supabase
		.from('users')
		.select('id, full_name, username, status, created_at')
		.eq('role', 'client')
		.order('created_at', { ascending: false });

	if (error) {
		console.error('[clients] list fetch failed:', error);
		return json({ message: 'Could not load clients.' }, { status: 500 });
	}

	return json({ clients: data ?? [] });
};

// Create a client. Only an admin may call this. RLS on `users` forces the row
// to be role='client' with owner_admin_id = auth.uid(), so ownership is enforced
// in the database regardless of what we send — we still set them explicitly to
// satisfy the WITH CHECK policy and NOT NULL columns.
const createSchema = z.object({
	fullName: z.string().trim().min(1, 'Full name is required.').max(120),
	username: z
		.string()
		.trim()
		.min(3, 'Username must be at least 3 characters.')
		.max(64)
		.regex(/^[a-zA-Z0-9._-]+$/, 'Use only letters, numbers, and . _ -'),
	password: z.string().min(8, 'Password must be at least 8 characters.').max(256)
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (locals.user?.role !== 'admin' || !locals.supabase) {
		return json({ message: 'Not authorized.' }, { status: 403 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ message: 'Invalid request body.' }, { status: 400 });
	}

	const parsed = createSchema.safeParse(body);
	if (!parsed.success) {
		return json(
			{
				message: 'Please check the form and try again.',
				errors: z.flattenError(parsed.error).fieldErrors
			},
			{ status: 400 }
		);
	}
	const { fullName, username, password } = parsed.data;

	const passwordHash = await hashPassword(password);

	const { data, error } = await locals.supabase
		.from('users')
		.insert({
			role: 'client',
			owner_admin_id: locals.user.id,
			username,
			full_name: fullName,
			password_hash: passwordHash,
			status: 'active'
		})
		.select('id, full_name, username, status, created_at')
		.single();

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
		console.error('[clients] create failed:', error);
		return json({ message: 'Could not create the client. Please try again.' }, { status: 500 });
	}

	return json({ client: data }, { status: 201 });
};
