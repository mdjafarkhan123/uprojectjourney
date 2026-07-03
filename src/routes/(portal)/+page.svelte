<script lang="ts">
	import { resolve } from '$app/paths';
	import LoginForm from '$lib/components/LoginForm.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import ProjectJourney from '$lib/components/ProjectJourney.svelte';
	import Button from '$lib/components/Button.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import { query } from '$lib/data/cache.svelte';
	import type { PortalProject } from '$lib/portal/types';
	import {
		projectStatusMeta,
		formatDate,
		formatRelative,
		currentMilestone,
		latestUpdate
	} from '$lib/portal/journey';

	let { data } = $props();

	// One endpoint, one cache — the per-project and milestone pages reuse this exact
	// key so opening a project or drilling into a milestone is instant (no refetch).
	const projectsQ = query<PortalProject[]>('portal:projects', async () => {
		const res = await fetch('/api/portal/projects');
		if (!res.ok) throw new Error('Could not load your projects.');
		const body = await res.json();
		return body.projects as PortalProject[];
	});

	const skeletonNodes = [0, 1, 2, 3, 4];

	// "Last updated" for a card: the newest timeline entry's date, else the project's
	// own updated_at (sliced to y-m-d so formatDate's date guard applies).
	function lastUpdatedIso(project: PortalProject): string {
		const latest = latestUpdate(project.milestones);
		return (latest?.entry_date ?? project.updated_at).slice(0, 10);
	}
</script>

<svelte:head>
	<title>{data.user ? 'Your project journey' : 'Sign in'}</title>
</svelte:head>

{#if data.user && data.user.role === 'client'}
	{#if projectsQ.error}
		<div class="state">
			<i class="ri-error-warning-line state__icon" aria-hidden="true"></i>
			<p class="state__text">{projectsQ.error}</p>
			<Button onclick={() => projectsQ.load()}>Try again</Button>
		</div>
	{:else if projectsQ.data === undefined}
		<!-- Skeleton: overview card + a row of journey nodes. -->
		<div class="card overview-skeleton">
			<Skeleton width="220px" height="26px" />
			<Skeleton width="100%" height="10px" radius="var(--radius-full)" />
			<div class="overview-skeleton__grid">
				<Skeleton width="100%" height="60px" />
				<Skeleton width="100%" height="60px" />
				<Skeleton width="100%" height="60px" />
			</div>
		</div>
		<div class="card journey-skeleton">
			<ol class="journey-skeleton__row">
				{#each skeletonNodes as n (n)}
					<li class="journey-skeleton__node">
						<Skeleton width="56px" height="14px" />
						<span class="journey-skeleton__marker"></span>
						<Skeleton width="80px" height="14px" />
					</li>
				{/each}
			</ol>
		</div>
	{:else if projectsQ.data.length === 0}
		<div class="state">
			<i class="ri-compass-3-line state__icon" aria-hidden="true"></i>
			<p class="state__text">
				Your project journey will appear here as soon as it's set up. Check back shortly.
			</p>
		</div>
	{:else if projectsQ.data.length === 1}
		<!-- Single project = single-journey feel: straight into the journey, no card. -->
		<ProjectJourney project={projectsQ.data[0]} />
	{:else}
		<!-- Multiple projects: one card each, opening its own journey. -->
		<div class="portal-home">
			<h1 class="portal-home__title">Your projects</h1>
			<div class="cards">
				{#each projectsQ.data as project (project.id)}
					{@const current = currentMilestone(project)}
					<article class="pcard">
						<a
							class="pcard__link"
							href={resolve(`/projects/${project.id}`)}
							aria-label="Open {project.name}"
						></a>
						<div class="pcard__head">
							<h2 class="pcard__name">{project.name}</h2>
							<span class="badge {projectStatusMeta[project.status].className}">
								{projectStatusMeta[project.status].label}
							</span>
						</div>

						<p class="pcard__current">
							<i class="ri-focus-3-line" aria-hidden="true"></i>
							{current ? current.name : 'All milestones complete'}
						</p>

						<div class="progress">
							<div class="progress__track">
								<div class="progress__bar" style="width: {project.progress}%"></div>
							</div>
							<span class="progress__value">{project.progress}%</span>
						</div>

						<div class="pcard__foot">
							<span class="pcard__updated" title={formatDate(lastUpdatedIso(project))}>
								<i class="ri-history-line" aria-hidden="true"></i>
								Updated {formatRelative(lastUpdatedIso(project))}
							</span>
							<span class="pcard__open">
								Open project <i class="ri-arrow-right-line" aria-hidden="true"></i>
							</span>
						</div>
					</article>
				{/each}
			</div>
		</div>
	{/if}
{:else}
	<div class="login-theme-toggle">
		<ThemeToggle />
	</div>

	<LoginForm
		intent="client"
		heading="Welcome back"
		subheading="Sign in to view your project journey."
	/>
{/if}

<style lang="scss">
	.login-theme-toggle {
		position: fixed;
		top: 16px;
		right: 16px;
		z-index: 10;
	}

	// --- Multi-project card list ---
	.portal-home {
		&__title {
			margin: 0 0 20px;
			font-size: 20px;
			font-weight: 600;
			line-height: 1.25;
			color: var(--text-heading);
		}
	}

	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 16px;
	}

	.pcard {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 20px;
		background-color: var(--neutral-primary-soft);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-base);
		box-shadow: var(--shadow-xs);
		transition:
			border-color 200ms,
			box-shadow 200ms;

		&:hover {
			border-color: var(--border-default-strong);
			box-shadow: var(--shadow-sm);
		}

		// Stretched link: covers the whole card so it's fully clickable. Transparent,
		// sits above the (non-interactive) content — clicks land on the link.
		&__link {
			position: absolute;
			inset: 0;
			z-index: 1;
			border-radius: var(--radius-base);

			&:focus-visible {
				outline: none;
				box-shadow: 0 0 0 3px var(--brand-medium);
			}
		}

		&__head {
			display: flex;
			align-items: flex-start;
			justify-content: space-between;
			gap: 12px;
		}

		&__name {
			margin: 0;
			font-size: 16px;
			font-weight: 600;
			line-height: 1.3;
			color: var(--text-heading);
		}

		&__current {
			display: inline-flex;
			align-items: center;
			gap: 6px;
			margin: 0;
			font-size: 13px;
			color: var(--text-body);

			i {
				font-size: 15px;
				color: var(--text-body-subtle);
			}
		}

		&__foot {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 12px;
			margin-top: 2px;
		}

		&__updated {
			display: inline-flex;
			align-items: center;
			gap: 4px;
			font-size: 12px;
			white-space: nowrap;
			color: var(--text-body-subtle);

			i {
				font-size: 13px;
			}
		}

		&__open {
			display: inline-flex;
			align-items: center;
			gap: 4px;
			font-size: 13px;
			font-weight: 500;
			color: var(--fg-brand);

			i {
				font-size: 15px;
				transition: transform 200ms;
			}
		}

		&:hover &__open i {
			transform: translateX(2px);
		}
	}

	// --- Loading skeleton ---
	.overview-skeleton {
		display: flex;
		flex-direction: column;
		gap: 20px;
		padding: 24px;
		margin-bottom: 24px;

		&__grid {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
			gap: 16px;
		}
	}

	.journey-skeleton {
		padding: 24px;

		&__row {
			display: flex;
			flex-direction: column;
			gap: 24px;
			margin: 0;
			padding: 0;
			list-style: none;
		}

		&__node {
			display: grid;
			grid-template-columns: 44px 1fr;
			align-items: center;
			gap: 8px 16px;
		}

		&__marker {
			grid-row: span 2;
			width: 44px;
			height: 44px;
			background-color: var(--neutral-secondary-medium);
			border-radius: var(--radius-full);
		}
	}

	@media (min-width: 769px) {
		.journey-skeleton__row {
			flex-direction: row;
		}

		.journey-skeleton__node {
			flex: 1 0 0;
			min-width: 120px;
			grid-template-columns: 1fr;
			justify-items: center;
		}
	}

	// --- Shared bits ---
	.progress {
		display: flex;
		align-items: center;
		gap: 10px;

		&__track {
			flex: 1;
			height: 8px;
			background-color: var(--neutral-tertiary-medium);
			border-radius: var(--radius-full);
			overflow: hidden;
		}

		&__bar {
			height: 100%;
			background-color: var(--brand);
			border-radius: var(--radius-full);
			transition: width 300ms ease;
		}

		&__value {
			min-width: 38px;
			font-size: 12px;
			font-weight: 600;
			font-variant-numeric: tabular-nums;
			text-align: right;
			color: var(--text-heading);
		}
	}
</style>
