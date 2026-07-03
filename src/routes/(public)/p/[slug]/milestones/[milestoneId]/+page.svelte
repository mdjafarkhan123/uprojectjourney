<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import MilestoneDetail from '$lib/components/MilestoneDetail.svelte';

	// The whole journey is already loaded by the public layout, so drilling into a
	// milestone reuses that data — no refetch. Find the milestone by route param.
	let { data } = $props();

	const found = $derived.by(() => {
		const targetId = page.params.milestoneId;
		const index = data.journey.milestones.findIndex((m) => m.id === targetId);
		return index >= 0 ? { milestone: data.journey.milestones[index], index } : null;
	});

	const backHref = $derived(resolve(`/p/${page.params.slug}`));
</script>

<svelte:head>
	<title>{found?.milestone.name ?? 'Milestone'}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<section class="page">
	<a class="page__back" href={backHref}>
		<i class="ri-arrow-left-line" aria-hidden="true"></i>
		<span>{data.journey.name}</span>
	</a>

	{#if found}
		<MilestoneDetail milestone={found.milestone} index={found.index} />
	{:else}
		<div class="state">
			<i class="ri-compass-3-line state__icon" aria-hidden="true"></i>
			<p class="state__text">This step isn't part of this journey.</p>
			<a class="btn btn--secondary" href={backHref}>Back to the journey</a>
		</div>
	{/if}
</section>
