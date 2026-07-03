<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import Button from '$lib/components/Button.svelte';
	import MilestoneDetail from '$lib/components/MilestoneDetail.svelte';
	import { query } from '$lib/data/cache.svelte';
	import type { PortalProject } from '$lib/portal/types';

	// Same cache key + fetcher as the portal home, so drilling into a milestone
	// reuses the already-loaded journey (instant, no refetch). On a fresh deep-link
	// the cache is empty and this fetch populates it.
	const projectsQ = query<PortalProject[]>('portal:projects', async () => {
		const res = await fetch('/api/portal/projects');
		if (!res.ok) throw new Error('Could not load your project.');
		const body = await res.json();
		return body.projects as PortalProject[];
	});

	// Resolve the milestone (and its parent project) from the shared cache.
	const found = $derived.by(() => {
		const projects = projectsQ.data;
		if (!projects) return null;
		const targetId = page.params.milestoneId;
		for (const project of projects) {
			const index = project.milestones.findIndex((m) => m.id === targetId);
			if (index >= 0) {
				return { project, milestone: project.milestones[index], index };
			}
		}
		return null;
	});

	// Distinguish "still loading" from "loaded, but no such milestone (or not yours)".
	const notFound = $derived(projectsQ.data !== undefined && found === null);

	const skeletonRows = [0, 1, 2];
</script>

<svelte:head>
	<title>{found?.milestone.name ?? 'Milestone'}</title>
</svelte:head>

<section class="page">
	<a class="page__back" href={resolve('/')}>
		<i class="ri-arrow-left-line" aria-hidden="true"></i>
		<span>{found?.project.name ?? 'Your journey'}</span>
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
			<p class="state__text">This step isn't part of your journey anymore.</p>
			<Button href={resolve('/')}>Back to your journey</Button>
		</div>
	{:else if !found}
		<div class="card skeleton-card">
			<Skeleton width="240px" height="26px" />
			<Skeleton width="100%" height="10px" radius="var(--radius-full)" />
		</div>
		<div class="card skeleton-card">
			{#each skeletonRows as row (row)}
				<Skeleton width="100%" height="18px" />
			{/each}
		</div>
	{:else}
		<MilestoneDetail milestone={found.milestone} index={found.index} />
	{/if}
</section>

<style lang="scss">
	// `.card`, `.page__back` and `.state` come from the shared portal stylesheet
	// ($lib/styles/portal.scss), scoped to `.portal, .public`. Buttons use <Button>.

	// Loading placeholder blocks (header + timeline) shown before the journey arrives.
	.skeleton-card {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 24px;

		& + & {
			margin-top: 28px;
		}
	}
</style>
