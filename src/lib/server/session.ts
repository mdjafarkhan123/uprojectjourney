import { randomBytes, createHash } from 'node:crypto';
import { SignJWT } from 'jose';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_JWT_SECRET } from '$env/static/private';
import { supabaseAdmin } from './supabase-admin';
import type { Database } from '$lib/database.types';

type UserRole = Database['public']['Enums']['user_role'];

/** Cookie carrying the opaque session token. */
export const SESSION_COOKIE = 'session';

/** Session lifetime: 30 days. */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Minted-JWT lifetime: short — re-minted on every request in hooks. */
const JWT_TTL_SECONDS = 5 * 60;

const jwtSecret = new TextEncoder().encode(SUPABASE_JWT_SECRET);

/** SHA-256 of the raw token, hex-encoded — this is what we store in `sessions`. */
export function hashToken(rawToken: string): string {
	return createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Create a session for a user: generate a 256-bit random token, store its
 * hash with an expiry, and return the raw token (to be set as a cookie) and
 * the expiry (for the cookie's maxAge). Uses the service-role client.
 */
export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
	const token = randomBytes(32).toString('base64url');
	const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

	const { error } = await supabaseAdmin.from('sessions').insert({
		user_id: userId,
		token_hash: hashToken(token),
		expires_at: expiresAt.toISOString()
	});
	if (error) throw error;

	return { token, expiresAt };
}

/** Delete a session by its raw token (logout). */
export async function deleteSession(rawToken: string): Promise<void> {
	const { error } = await supabaseAdmin
		.from('sessions')
		.delete()
		.eq('token_hash', hashToken(rawToken));
	if (error) throw error;
}

export type SessionUser = {
	id: string;
	role: UserRole;
	username: string;
	fullName: string;
	avatarUrl: string | null;
	/** The admin who owns this client (null for admins). Used to attribute portal visits. */
	ownerAdminId: string | null;
};

/**
 * Validate a raw session token: look up the session, check it hasn't expired,
 * and confirm the user is still active. Returns the user on success, or null
 * for any failure (missing/expired session, inactive/deleted user). Uses the
 * service-role client. Expired sessions are pruned lazily.
 */
export async function validateSession(rawToken: string): Promise<SessionUser | null> {
	const { data: session, error } = await supabaseAdmin
		.from('sessions')
		.select(
			'id, expires_at, users(id, role, username, full_name, avatar_url, status, owner_admin_id)'
		)
		.eq('token_hash', hashToken(rawToken))
		.maybeSingle();

	if (error || !session) return null;

	if (new Date(session.expires_at).getTime() <= Date.now()) {
		await supabaseAdmin.from('sessions').delete().eq('id', session.id);
		return null;
	}

	const user = session.users;
	if (!user || user.status !== 'active') return null;

	return {
		id: user.id,
		role: user.role,
		username: user.username,
		fullName: user.full_name,
		avatarUrl: user.avatar_url,
		ownerAdminId: user.owner_admin_id
	};
}

/**
 * Mint a short-lived HS256 JWT for the RLS bridge. `role: authenticated` is
 * the Postgres role Supabase expects; `user_role` is the custom claim our RLS
 * policies read (`auth.jwt()->>'user_role'`).
 */
export function mintAccessToken(user: { id: string; role: UserRole }): Promise<string> {
	return new SignJWT({ role: 'authenticated', user_role: user.role })
		.setProtectedHeader({ alg: 'HS256' })
		.setSubject(user.id)
		.setAudience('authenticated')
		.setIssuedAt()
		.setExpirationTime(Math.floor(Date.now() / 1000) + JWT_TTL_SECONDS)
		.sign(jwtSecret);
}

/**
 * Request-scoped, RLS-enforced Supabase client carrying the minted JWT. All
 * per-request reads/writes go through this — never the service role.
 */
export function createRequestClient(accessToken: string): SupabaseClient<Database> {
	return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
		global: { headers: { Authorization: `Bearer ${accessToken}` } },
		auth: {
			persistSession: false,
			autoRefreshToken: false
		}
	});
}
