<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import Button from '$lib/components/Button.svelte';
	import { clearVisitTracking } from '$lib/portal/track';

	type Props = {
		fullName: string;
		avatarUrl: string | null;
		companyName: string | null;
		logoUrl: string | null;
	};

	let { fullName, avatarUrl, companyName, logoUrl }: Props = $props();

	let loggingOut = $state(false);

	async function logout() {
		if (loggingOut) return;
		loggingOut = true;
		// Clear the stored visit so a next login (maybe a different user in this
		// browser) starts a fresh visit rather than resuming this one.
		clearVisitTracking();
		try {
			await fetch('/api/auth/logout', { method: 'POST' });
			await goto(resolve('/'), { invalidateAll: true });
		} catch {
			loggingOut = false;
		}
	}

	const initials = $derived(
		fullName
			.split(' ')
			.map((part) => part[0])
			.filter(Boolean)
			.slice(0, 2)
			.join('')
			.toUpperCase()
	);

	// Fallback label when the admin hasn't set a company name.
	const brandLabel = $derived(companyName?.trim() || 'Client Journey');
</script>

<header class="portal-header">
	<a class="portal-header__brand" href={resolve('/')} aria-label={brandLabel}>
		{#if logoUrl}
			<img class="portal-header__logo" src={logoUrl} alt={brandLabel} />
		{:else}
			<span class="portal-header__brand-name">{brandLabel}</span>
		{/if}
	</a>

	<div class="portal-header__spacer"></div>

	<ThemeToggle />

	<div class="portal-header__user">
		{#if avatarUrl}
			<img class="portal-header__avatar-img" src={avatarUrl} alt="" />
		{:else}
			<span class="portal-header__avatar" aria-hidden="true">{initials}</span>
		{/if}
		<span class="portal-header__name">{fullName}</span>
	</div>

	<Button
		variant="secondary"
		size="sm"
		icon="ri-logout-box-r-line"
		loading={loggingOut}
		loadingLabel="Signing out…"
		collapseLabel
		ariaLabel="Sign out"
		onclick={logout}
	>
		Sign out
	</Button>
</header>

<style lang="scss">
	.portal-header {
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
			text-decoration: none;
			border-radius: var(--radius-base);

			&:focus-visible {
				outline: none;
				box-shadow: 0 0 0 3px var(--brand-medium);
			}
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

		&__user {
			display: flex;
			align-items: center;
			gap: 10px;
		}

		&__avatar {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 36px;
			height: 36px;
			font-size: 13px;
			font-weight: 600;
			color: var(--text-white);
			background-color: var(--brand);
			border-radius: var(--radius-full);
		}

		&__avatar-img {
			width: 36px;
			height: 36px;
			object-fit: cover;
			border-radius: var(--radius-full);
		}

		&__name {
			font-size: 14px;
			font-weight: 500;
			color: var(--text-heading);
		}

		@media (max-width: 768px) {
			padding: 0 16px;

			&__name {
				display: none;
			}
		}
	}
</style>
