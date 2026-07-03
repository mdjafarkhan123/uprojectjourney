import type { LayoutServerLoad } from './$types';

// Resolve the signed-in identity ONCE for the admin shell. Access control lives
// entirely in `hooks.server.ts` (the server-side source of truth), so this load
// deliberately reads nothing from `url` — that keeps SvelteKit from re-running it
// on client-side navigation. Result: the shell checks `data.user` locally on every
// tab switch with zero extra server round-trips. locals.user carries no secrets.
export const load: LayoutServerLoad = async ({ locals }) => {
	return { user: locals.user };
};
