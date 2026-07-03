import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

// The client-facing portal lives at `/`. This layout wraps the whole client tree
// (home + deeper project/milestone pages). It is NOT applied to `/master`,
// which sits outside this route group.
//
//  - Admin visiting the portal  → sent to their own area (`/master`).
//  - Client                     → gets the portal shell + their admin's branding.
//  - Logged out                 → `user` is null; the page renders the login form.
//
// Branding is SHELL data (logo / company name / brand colour in the header), so it
// is loaded here on the server and rendered immediately — no flash of default brand.
export const load: LayoutServerLoad = async ({ locals, depends }) => {
	if (locals.user?.role === 'admin') {
		redirect(303, '/master');
	}

	// Tag this load so the portal's poll can re-run it (and re-read branding under RLS)
	// when the admin changes their logo / company name / brand colour — see
	// startPortalPolling(). Without this, branding would only refresh on reload.
	depends('portal:branding');

	let branding: {
		company_name: string | null;
		logo_url: string | null;
		primary_color: string | null;
	} | null = null;
	// The owning admin's personal name for the journey's "Updated by {name}" label.
	// Read via a locked-down RPC (a client can't select the admin's users row directly).
	let adminName: string | null = null;

	if (locals.user?.role === 'client' && locals.supabase) {
		const [brandingRes, nameRes] = await Promise.all([
			// branding_client_select returns the owning admin's single row (or none).
			locals.supabase
				.from('admin_branding')
				.select('company_name, logo_url, primary_color')
				.maybeSingle(),
			locals.supabase.rpc('get_owner_admin_name')
		]);
		branding = brandingRes.data;
		adminName = (nameRes.data as string | null) ?? null;
	}

	return { user: locals.user, branding, adminName };
};
