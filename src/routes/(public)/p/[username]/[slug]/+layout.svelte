<script lang="ts">
	import { browser } from '$app/environment';
	import { invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { startPublicVisitTracking } from '$lib/portal/public-track';

	let { data, children } = $props();

	// Record the whole PUBLIC visit from the shared-link shell (not per page) so
	// navigating between the journey and a milestone stays one visit. Keyed on the
	// link's username/slug: it starts/resumes tracking and the cleanup stops the
	// heartbeat when the visitor leaves. Mirrors the logged-in portal shell.
	const username = $derived(page.params.username);
	const slug = $derived(page.params.slug);
	$effect(() => {
		if (!username || !slug) return;
		return startPublicVisitTracking(username, slug);
	});

	// Live updates for the shared public view: every few seconds, re-run the server
	// load (re-fetches the public-journey RPC) so any admin edit shows up on its own,
	// no manual refresh. The re-fetch swaps `data.journey` in place — no flicker. We
	// pause while the tab is hidden (nobody's looking) and pull immediately on refocus.
	$effect(() => {
		if (!browser) return;
		const POLL_MS = 3_000;
		const refresh = () => {
			if (document.visibilityState === 'visible') void invalidate('public:journey');
		};
		const timer = setInterval(refresh, POLL_MS);
		document.addEventListener('visibilitychange', refresh);
		return () => {
			clearInterval(timer);
			document.removeEventListener('visibilitychange', refresh);
		};
	});

	const branding = $derived(data.journey.branding);
	const brandLabel = $derived(branding?.company_name?.trim() || 'Client Journey');

	// Adopt the owning admin's brand colour exactly like the logged-in portal shell:
	// derive hover/focus shades from the single stored hex with color-mix. Applied as
	// an inline CSS-var override scoped to this public shell. primary_color is
	// validated to `#rrggbb` on write, so it's safe to interpolate.
	const brandColor = $derived(branding?.primary_color?.trim() ?? '');
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

<div class="public" style={brandStyle}>
	<header class="public-header">
		<span class="public-header__brand">
			{#if branding?.logo_url}
				<img class="public-header__logo" src={branding.logo_url} alt={brandLabel} />
			{:else}
				<span class="public-header__brand-name">{brandLabel}</span>
			{/if}
		</span>

		<div class="public-header__spacer"></div>

		<ThemeToggle />
	</header>

	<main class="public__content">
		{@render children()}
	</main>

	<footer class="public-footer">
		<span class="public-footer__note">
			<i class="ri-eye-line" aria-hidden="true"></i>
			You're viewing a shared, read-only project journey.
		</span>
	</footer>
</div>

<style lang="scss">
	.public {
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

	.public-header {
		display: flex;
		align-items: center;
		gap: 16px;
		height: 64px;
		padding: 0 24px;
		background-color: var(--neutral-primary-soft);
		border-bottom: 1px solid var(--border-default);

		&__brand {
			display: inline-flex;
			align-items: center;
		}

		&__logo {
			display: block;
			max-height: 36px;
			max-width: 180px;
			object-fit: contain;
		}

		&__brand-name {
			font-size: 18px;
			font-weight: 600;
			color: var(--brand);
		}

		&__spacer {
			flex: 1;
		}

		@media (max-width: 768px) {
			padding: 0 16px;
		}
	}

	.public-footer {
		padding: 20px 24px 32px;
		text-align: center;

		&__note {
			display: inline-flex;
			align-items: center;
			gap: 6px;
			font-size: 12px;
			color: var(--text-body-subtle);

			i {
				font-size: 14px;
			}
		}
	}
</style>
