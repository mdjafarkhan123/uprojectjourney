<script lang="ts">
	import { browser } from '$app/environment';
	import PortalHeader from '$lib/components/PortalHeader.svelte';
	import { startVisitTracking } from '$lib/portal/track';

	let { data, children } = $props();

	// Track the whole VISIT from the portal shell (not per page) so navigating around
	// inside the portal stays one visit. Keyed on the client's stable id: a client
	// session starts/resumes tracking; logged-out or admin → no tracking. The effect's
	// cleanup stops the heartbeat when the client leaves the portal tree.
	const clientId = $derived(data.user?.role === 'client' ? data.user.id : null);
	$effect(() => {
		if (!clientId) return;
		return startVisitTracking(clientId);
	});

	// Live updates: while the portal is open, poll for changes every few seconds and
	// refetch through the secure API so any admin edit shows up on its own — no manual
	// refresh. The layout persists across portal navigation, so one timer covers the
	// whole visit. Dynamically imported to keep it out of the initial shell bundle
	// (the portal renders first, polling wires up after hydration).
	$effect(() => {
		if (!browser || !clientId) return;
		let cleanup: (() => void) | undefined;
		let cancelled = false;
		import('$lib/portal/poll').then(({ startPortalPolling }) => {
			if (cancelled) return;
			cleanup = startPortalPolling();
		});
		return () => {
			cancelled = true;
			cleanup?.();
		};
	});

	// Adopt the owning admin's brand colour. We only have one hex, so derive the
	// hover/focus shades with color-mix rather than storing extra colours. Applied
	// as an inline CSS-var override scoped to the portal shell — admin pages are
	// untouched. primary_color is validated to `#rrggbb` on write, so it's safe to
	// interpolate. Blank/null → no override, the default brand tokens apply.
	const brandColor = $derived(data.branding?.primary_color?.trim() ?? '');
	const brandStyle = $derived(
		brandColor
			? `--brand:${brandColor};` +
					`--brand-strong:color-mix(in srgb, ${brandColor} 85%, #000);` +
					`--brand-medium:color-mix(in srgb, ${brandColor} 35%, transparent);` +
					`--fg-brand:${brandColor};` +
					`--border-brand:${brandColor};`
			: undefined
	);
</script>

{#if data.user && data.user.role === 'client'}
	<div class="portal" style={brandStyle}>
		<PortalHeader
			fullName={data.user.fullName}
			avatarUrl={data.user.avatarUrl}
			companyName={data.branding?.company_name ?? null}
			logoUrl={data.branding?.logo_url ?? null}
		/>
		<main class="portal__content">
			{@render children()}
		</main>
	</div>
{:else}
	<!-- Logged out: render the bare login page with no portal chrome. -->
	{@render children()}
{/if}

<style lang="scss">
	.portal {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
		background-color: var(--neutral-secondary-soft);

		&__content {
			flex: 1;
			width: 100%;
			max-width: 960px;
			margin: 0 auto;
			padding: 32px 24px;
		}

		@media (max-width: 768px) {
			&__content {
				padding: 24px 16px;
			}
		}
	}
</style>
