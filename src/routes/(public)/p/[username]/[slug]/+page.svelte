<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import ProjectJourney from '$lib/components/ProjectJourney.svelte';

	let { data } = $props();

	// Milestone links point back into the public path (not the portal's `/milestones`).
	const milestoneHref = (id: string) =>
		resolve(`/p/${page.params.username}/${page.params.slug}/milestones/${id}`);
</script>

<svelte:head>
	<title>{data.journey.name}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<ProjectJourney project={data.journey} {milestoneHref} />
