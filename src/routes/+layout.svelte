<script lang="ts">
	import '../app.scss';
	import 'remixicon/fonts/remixicon.css';
	import favicon from '$lib/assets/ufavicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
