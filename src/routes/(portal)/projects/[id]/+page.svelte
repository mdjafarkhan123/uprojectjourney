<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import ProjectJourney from '$lib/components/ProjectJourney.svelte';
	import Button from '$lib/components/Button.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import { query } from '$lib/data/cache.svelte';
	import type { PortalProject } from '$lib/portal/types';

	// Same cache key + fetcher as the portal home and milestone page, so opening a
	// project from the card list is instant (no refetch). A fresh deep-link populates it.
	const projectsQ = query<PortalProject[]>('portal:projects', async () => {
		const res = await fetch('/api/portal/projects');
		if (!res.ok) throw new Error('Could not load your project.');
		const body = await res.json();
		return body.projects as PortalProject[];
	});

	const found = $derived.by(() => {
		const projects = projectsQ.data;
		if (!projects) return null;
		return projects.find((p) => p.id === page.params.id) ?? null;
	});

	// Distinguish "still loading" from "loaded, but no such project (or not yours)".
	const notFound = $derived(projectsQ.data !== undefined && found === null);

	const skeletonNodes = [0, 1, 2, 3, 4];
</script>

<svelte:head>
	<title>{found?.name ?? 'Project'}</title>
</svelte:head>

<section class="page">
	<a class="page__back" href={resolve('/')}>
		<i class="ri-arrow-left-line" aria-hidden="true"></i>
		<span>Your projects</span>
	</a>

	{#if projectsQ.error}
		<div class="state">
			<i class="ri-error-warning-line state__icon" aria-hidden="true"></i>
			<p class="state__text">{projectsQ.error}</p>
			<Button onclick={() => projectsQ.load()}>Try again</Button>
		</div>
	{:else if notFound}
		<div class="state">
			<i class="ri-compass-3-line state__icon" aria-hidden="true"></i>
			<p class="state__text">This project isn't part of your journey anymore.</p>
			<Button href={resolve('/')}>Back to your projects</Button>
		</div>
	{:else if !found}
		<div class="card overview">
			<Skeleton width="220px" height="26px" />
			<Skeleton width="100%" height="10px" radius="var(--radius-full)" />
			<div class="overview__grid">
				<Skeleton width="100%" height="60px" />
				<Skeleton width="100%" height="60px" />
				<Skeleton width="100%" height="60px" />
			</div>
		</div>
		<div class="card journey-card">
			<ol class="journey">
				{#each skeletonNodes as n (n)}
					<li class="journey__node">
						<span class="journey__link">
							<Skeleton width="56px" height="14px" />
							<span class="journey__marker"></span>
							<Skeleton width="80px" height="14px" />
						</span>
					</li>
				{/each}
			</ol>
		</div>
	{:else}
		<ProjectJourney project={found} />
	{/if}
</section>

<style lang="scss">
	.page {
		&__back {
			display: inline-flex;
			align-items: center;
			gap: 6px;
			margin-bottom: 20px;
			font-size: 14px;
			color: var(--text-body);
			text-decoration: none;

			&:hover {
				color: var(--text-heading);
			}

			i {
				font-size: 18px;
			}
		}
	}

	// Skeleton-only card styling (the real cards live in ProjectJourney).
	.card {
		background-color: var(--neutral-primary-soft);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-base);
		box-shadow: var(--shadow-xs);
	}

	.overview {
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

	.journey-card {
		padding: 24px;
	}

	.journey {
		display: flex;
		flex-direction: column;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.journey__node {
		position: relative;
	}

	.journey__link {
		display: grid;
		grid-template-columns: 44px 1fr;
		align-items: center;
		gap: 8px 16px;
		padding-bottom: 28px;
	}

	.journey__marker {
		display: inline-flex;
		width: 44px;
		height: 44px;
		background-color: var(--neutral-secondary-medium);
		border-radius: var(--radius-full);
	}

	@media (min-width: 769px) {
		.journey {
			flex-direction: row;
		}

		.journey__node {
			flex: 1 0 0;
			min-width: 120px;
		}

		.journey__link {
			grid-template-columns: 1fr;
			justify-items: center;
		}
	}

	.state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		padding: 64px 24px;
		text-align: center;
		background-color: var(--neutral-primary-soft);
		border: 1px dashed var(--border-default-strong);
		border-radius: var(--radius-base);

		&__icon {
			font-size: 32px;
			color: var(--text-body-subtle);
		}

		&__text {
			margin: 0;
			max-width: 380px;
			font-size: 14px;
			line-height: 1.6;
			color: var(--text-body);
		}
	}
</style>
