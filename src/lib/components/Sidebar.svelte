<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';

	type NavItem = {
		label: string;
		href:
			'/master' | '/master/projects' | '/master/clients' | '/master/reporting' | '/master/settings';
		icon: string;
		/** Active when the current path starts with `match` (defaults to exact href). */
		match?: string;
	};

	type Props = {
		/** Mobile drawer open state (ignored on desktop, where the sidebar is always shown). */
		open?: boolean;
		/** Called when a nav item is chosen — lets the parent close the mobile drawer. */
		onNavigate?: () => void;
	};

	let { open = false, onNavigate }: Props = $props();

	const items: NavItem[] = [
		{ label: 'Dashboard', href: '/master', icon: 'ri-dashboard-line' },
		{ label: 'Projects', href: '/master/projects', icon: 'ri-folder-line' },
		{ label: 'Clients', href: '/master/clients', icon: 'ri-team-line' },
		{ label: 'Reporting', href: '/master/reporting', icon: 'ri-bar-chart-2-line' },
		{ label: 'Settings', href: '/master/settings', icon: 'ri-settings-3-line' }
	];

	function isActive(item: NavItem): boolean {
		const path = page.url.pathname;
		if (item.match) return path.startsWith(item.match);
		// Exact match for the dashboard root so it isn't lit up on child routes.
		return item.href === '/master' ? path === item.href : path.startsWith(item.href);
	}
</script>

<aside class="sidebar" class:sidebar--open={open}>
	<div class="sidebar__inner">
		<div class="sidebar__brand">
			<i class="ri-route-line sidebar__brand-icon" aria-hidden="true"></i>
			<span class="sidebar__brand-name">Client Journey</span>
		</div>

		<nav class="sidebar__nav" aria-label="Admin">
			<ul class="sidebar__list">
				{#each items as item (item.href)}
					<li>
						<a
							class="sidebar__item"
							class:sidebar__item--active={isActive(item)}
							href={resolve(item.href)}
							aria-current={isActive(item) ? 'page' : undefined}
							onclick={onNavigate}
						>
							<i class="sidebar__item-icon {item.icon}" aria-hidden="true"></i>
							<span class="sidebar__item-label">{item.label}</span>
						</a>
					</li>
				{/each}
			</ul>
		</nav>
	</div>
</aside>

<style lang="scss">
	.sidebar {
		flex-shrink: 0;
		width: 256px;
		background-color: var(--neutral-primary-soft);
		border-right: 1px solid var(--border-default);

		&__inner {
			display: flex;
			flex-direction: column;
			height: 100%;
			padding: 16px 12px;
			overflow-y: auto;
		}

		&__brand {
			display: flex;
			align-items: center;
			gap: 8px;
			padding: 8px;
			margin-bottom: 16px;
		}

		&__brand-icon {
			font-size: 22px;
			color: var(--fg-brand);
		}

		&__brand-name {
			font-size: 15px;
			font-weight: 600;
			color: var(--text-heading);
		}

		&__nav {
			flex: 1;
		}

		&__list {
			display: flex;
			flex-direction: column;
			gap: 8px;
			margin: 0;
			padding: 0;
			list-style: none;
		}

		&__item {
			display: flex;
			align-items: center;
			padding: 8px;
			font-size: 14px;
			font-weight: 500;
			color: var(--text-body);
			text-decoration: none;
			border-radius: var(--radius-base);
			transition: background-color 200ms;

			&:hover {
				background-color: var(--neutral-secondary-medium);
			}

			&:focus-visible {
				outline: none;
				box-shadow: 0 0 0 3px var(--brand-medium);
			}
		}

		&__item-icon {
			font-size: 20px;
			color: var(--text-body);
			transition: color 75ms;
		}

		&__item-label {
			margin-left: 12px;
		}

		&__item:hover &__item-icon {
			color: var(--brand-medium);
		}

		&__item--active {
			background-color: var(--neutral-secondary-strong, var(--neutral-quaternary));
			color: var(--brand);

			.sidebar__item-icon {
				color: var(--brand);
			}
		}
	}

	// Desktop: static column. Mobile: off-canvas drawer toggled by `--open`.
	@media (max-width: 768px) {
		.sidebar {
			position: fixed;
			top: 0;
			left: 0;
			z-index: 40;
			height: 100vh;
			transform: translateX(-100%);
			transition: transform 200ms ease;
			box-shadow: var(--shadow-lg);

			&--open {
				transform: translateX(0);
			}
		}
	}
</style>
