<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';

	type Props = {
		fullName: string;
		username: string;
		/** Toggles the mobile sidebar drawer. */
		onToggleSidebar?: () => void;
	};

	let { fullName, username, onToggleSidebar }: Props = $props();

	let loggingOut = $state(false);

	async function logout() {
		if (loggingOut) return;
		loggingOut = true;
		try {
			await fetch('/api/auth/logout', { method: 'POST' });
			await goto(resolve('/master'), { invalidateAll: true });
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
</script>

<header class="topbar">
	<button
		class="topbar__menu"
		type="button"
		onclick={onToggleSidebar}
		aria-label="Open navigation menu"
	>
		<i class="ri-menu-line" aria-hidden="true"></i>
	</button>

	<div class="topbar__spacer"></div>

	<ThemeToggle />

	<div class="topbar__user">
		<span class="topbar__avatar" aria-hidden="true">{initials}</span>
		<span class="topbar__identity">
			<span class="topbar__name">{fullName}</span>
			<span class="topbar__username">{username}</span>
		</span>
	</div>

	<button class="topbar__signout" type="button" onclick={logout} disabled={loggingOut}>
		{#if loggingOut}
			<span class="topbar__spinner" aria-hidden="true"></span>
			<span>Signing out…</span>
		{:else}
			<i class="ri-logout-box-r-line" aria-hidden="true"></i>
			<span>Sign out</span>
		{/if}
	</button>
</header>

<style lang="scss">
	.topbar {
		display: flex;
		align-items: center;
		gap: 16px;
		height: 64px;
		padding: 0 24px;
		background-color: var(--neutral-primary-soft);
		border-bottom: 1px solid var(--border-default);

		&__menu {
			display: none;
			align-items: center;
			justify-content: center;
			width: 40px;
			height: 40px;
			font-size: 20px;
			color: var(--text-heading);
			background: none;
			border: 1px solid var(--border-default-medium);
			border-radius: var(--radius-base);
			cursor: pointer;
			transition: background-color 200ms;

			&:hover {
				background-color: var(--neutral-secondary-medium);
			}

			&:focus-visible {
				outline: none;
				box-shadow: 0 0 0 3px var(--brand-medium);
			}
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

		&__identity {
			display: flex;
			flex-direction: column;
			line-height: 1.3;
		}

		&__name {
			font-size: 14px;
			font-weight: 500;
			color: var(--text-heading);
		}

		&__username {
			font-size: 12px;
			color: var(--text-body-subtle);
		}

		&__signout {
			display: inline-flex;
			align-items: center;
			gap: 8px;
			padding: 8px 14px;
			font-family: inherit;
			font-size: 14px;
			font-weight: 500;
			color: var(--text-body);
			background-color: var(--neutral-secondary-medium);
			border: 1px solid var(--border-default-medium);
			border-radius: var(--radius-base);
			box-shadow: var(--shadow-xs);
			cursor: pointer;
			transition:
				color 200ms,
				background-color 200ms;

			i {
				font-size: 16px;
			}

			&:hover:not(:disabled) {
				background-color: var(--neutral-tertiary-medium);
				color: var(--text-heading);
			}

			&:focus-visible {
				outline: none;
				box-shadow: 0 0 0 3px var(--brand-medium);
			}

			&:disabled {
				cursor: not-allowed;
				opacity: 0.85;
			}
		}

		&__spinner {
			width: 16px;
			height: 16px;
			border: 2px solid var(--border-default-strong);
			border-top-color: var(--text-body);
			border-radius: var(--radius-full);
			animation: cj-spin 700ms linear infinite;
		}

		@media (max-width: 768px) {
			padding: 0 16px;

			&__menu {
				display: inline-flex;
			}

			&__signout span:not(.topbar__spinner) {
				display: none;
			}

			&__identity {
				display: none;
			}
		}
	}
</style>
