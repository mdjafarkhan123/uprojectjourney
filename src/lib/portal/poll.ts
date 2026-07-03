import { browser } from '$app/environment';
import { invalidate as invalidateLoad } from '$app/navigation';
import { invalidate } from '$lib/data/cache.svelte';

// Client-portal LIVE UPDATES via simple polling. While the portal tab is open, we
// re-pull the client's data every few seconds so any change the admin makes shows up
// on its own, no manual refresh. No websocket to drop, no token to expire — just a timer.
//
// Like the socket, polling is only an INVALIDATION SIGNAL: it re-fetches through the
// secure /api/portal/projects endpoint (and re-runs the branding server load) rather
// than trusting any client-side data. RLS stays the single source of truth.
//
// The refetch is silent — `invalidate` triggers a stale-while-revalidate reload that
// only shows a skeleton when there's nothing yet, so live updates never flash.

// The cache key every portal page reads through `query()`; invalidating it forces a
// background refetch via /api/portal/projects.
const PORTAL_CACHE_KEY = 'portal:projects';

// SvelteKit load dependency the portal layout registers via `depends()`. Re-running it
// re-reads admin_branding (logo / company name / brand colour) under RLS.
const BRANDING_LOAD_DEP = 'portal:branding';

// How often we re-pull the client's project data.
const POLL_INTERVAL_MS = 3_000;

// Branding changes rarely and its refetch is a full server-load round trip, so we
// refresh it far less often than the project data (every 5th tick ≈ 15s).
const BRANDING_EVERY_N_TICKS = 5;

/**
 * Start polling the portal for changes. Call once from the portal shell layout
 * (browser-only). Returns a cleanup that stops the timer and listeners.
 */
export function startPortalPolling(): () => void {
	if (!browser) return () => {};

	let ticks = 0;

	function pull(withBranding: boolean) {
		invalidate(PORTAL_CACHE_KEY);
		if (withBranding) void invalidateLoad(BRANDING_LOAD_DEP);
	}

	function tick() {
		// Skip while the tab is in the background — nobody's looking, and we pull
		// immediately on refocus anyway. Saves needless API calls.
		if (document.visibilityState !== 'visible') return;
		ticks += 1;
		pull(ticks % BRANDING_EVERY_N_TICKS === 0);
	}

	// Coming back to the tab: pull once right away so what you see is current the
	// instant you look, without waiting for the next interval.
	function onVisible() {
		if (document.visibilityState === 'visible') pull(true);
	}

	const timer = setInterval(tick, POLL_INTERVAL_MS);
	document.addEventListener('visibilitychange', onVisible);

	return () => {
		clearInterval(timer);
		document.removeEventListener('visibilitychange', onVisible);
	};
}
