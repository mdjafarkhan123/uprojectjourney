import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import {
	SESSION_COOKIE,
	validateSession,
	mintAccessToken,
	createRequestClient
} from '$lib/server/session';

export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get(SESSION_COOKIE);

	if (token) {
		const user = await validateSession(token);
		if (user) {
			event.locals.user = user;
			event.locals.supabase = createRequestClient(await mintAccessToken(user));
		} else {
			// Stale or invalid session cookie — clear it.
			event.cookies.delete(SESSION_COOKIE, { path: '/' });
			event.locals.user = null;
			event.locals.supabase = null;
		}
	} else {
		event.locals.user = null;
		event.locals.supabase = null;
	}

	// Route guard: the admin area beyond the login page requires an admin.
	// `/master` (login) and `/master/signup` (signup) are the public admin pages.
	// This is the single source of truth for admin access — resolved here on the
	// server so page/layout loads never need to re-check on client navigation.
	const { pathname } = event.url;
	if (
		pathname.startsWith('/master/') &&
		pathname !== '/master/signup' &&
		event.locals.user?.role !== 'admin'
	) {
		redirect(303, '/master');
	}

	// A signed-in client has no business on the admin login page — send them to
	// their portal. (Previously lived in the now-removed /master +page.server.ts.)
	if (pathname === '/master' && event.locals.user?.role === 'client') {
		redirect(303, '/');
	}

	return resolve(event);
};
