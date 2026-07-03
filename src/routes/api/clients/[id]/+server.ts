import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { hashPassword } from '$lib/server/password';
import { supabaseAdmin } from '$lib/server/supabase-admin';

// Edit a client and/or change their status. Only an admin may call it. Writes go
// through the RLS-enforced client so an admin can only touch their own clients.
// Deactivating additionally revokes access immediately by deleting the user's
// sessions — and because `sessions` is deny-all under RLS, that delete must use
// the service-role client (server-only).
const patchSchema = z
	.object({
		status: z.enum(['active', 'inactive']).optional(),
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

export const PATCH: RequestHandler = async ({ request, params, locals }) => {
	if (locals.user?.role !== 'admin' || !locals.supabase) {
		return json({ message: 'Not authorized.' }, { status: 403 });
	}

	const id = params.id ?? '';
	if (!z.uuid().safeParse(id).success) {
		return json({ message: 'Invalid client id.' }, { status: 400 });
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

	// Map provided fields to DB columns; re-hash only when a new password is given.
	const update: {
		status?: 'active' | 'inactive';
		full_name?: string;
		username?: string;
		password_hash?: string;
	} = {};
	if (input.status !== undefined) update.status = input.status;
	if (input.fullName !== undefined) update.full_name = input.fullName;
	if (input.username !== undefined) update.username = input.username;
	if (input.password !== undefined) update.password_hash = await hashPassword(input.password);

	const { data, error } = await locals.supabase
		.from('users')
		.update(update)
		.eq('id', id)
		.eq('role', 'client')
		.select('id, full_name, username, status, created_at')
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
		console.error('[clients] update failed:', error);
		return json({ message: 'Could not update the client. Please try again.' }, { status: 500 });
	}
	// Either the client doesn't exist or RLS hid it (not this admin's client).
	if (!data) {
		return json({ message: 'Client not found.' }, { status: 404 });
	}

	if (input.status === 'inactive') {
		const { error: sessionError } = await supabaseAdmin.from('sessions').delete().eq('user_id', id);
		if (sessionError) {
			// The status change already succeeded; surface a warning instead of a hard failure.
			console.error('[clients] session revoke failed:', sessionError);
			return json({
				client: data,
				warning: 'Client deactivated, but existing sessions could not be cleared.'
			});
		}
	}

	return json({ client: data });
};

// Permanently delete a client. Admin-only; RLS restricts the delete to the
// admin's own clients. Because `projects.client_id` cascades, deleting a client
// with projects would silently destroy those projects (and their milestones and
// timeline updates), so we refuse when the client still has projects — the admin
// must clear them first. The client's sessions cascade away with the row.
export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (locals.user?.role !== 'admin' || !locals.supabase) {
		return json({ message: 'Not authorized.' }, { status: 403 });
	}

	const id = params.id ?? '';
	if (!z.uuid().safeParse(id).success) {
		return json({ message: 'Invalid client id.' }, { status: 400 });
	}

	// Count this admin's projects assigned to the client (RLS scopes to the owner).
	const { count, error: countError } = await locals.supabase
		.from('projects')
		.select('id', { count: 'exact', head: true })
		.eq('client_id', id);

	if (countError) {
		console.error('[clients] project count failed:', countError);
		return json({ message: 'Could not delete the client. Please try again.' }, { status: 500 });
	}
	if ((count ?? 0) > 0) {
		return json(
			{
				message: `This client still has ${count} project${count === 1 ? '' : 's'}. Reassign or delete ${count === 1 ? 'it' : 'them'} before deleting the client.`
			},
			{ status: 409 }
		);
	}

	const { data, error } = await locals.supabase
		.from('users')
		.delete()
		.eq('id', id)
		.eq('role', 'client')
		.select('id')
		.maybeSingle();

	if (error) {
		console.error('[clients] delete failed:', error);
		return json({ message: 'Could not delete the client. Please try again.' }, { status: 500 });
	}
	if (!data) {
		return json({ message: 'Client not found.' }, { status: 404 });
	}

	return json({ id: data.id });
};
