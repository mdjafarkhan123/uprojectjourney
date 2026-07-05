<script lang="ts">
	import '../app.scss';
	// Subset of RemixIcon (only the ~70 icons this app uses) — see scripts/build-icons.mjs.
	// Replaces the full 189 KB font + 157 KB CSS with a ~5 KB font + ~4 KB CSS.
	import '$lib/styles/remixicon.css';
	import favicon from '$lib/assets/ufavicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
