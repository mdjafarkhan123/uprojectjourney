<script lang="ts">
	// Shimmering placeholder block. Compose several to sketch a loading layout.
	type Props = {
		width?: string;
		height?: string;
		radius?: string;
	};

	let { width = '100%', height = '16px', radius = 'var(--radius-sm)' }: Props = $props();
</script>

<span
	class="skeleton"
	style="width: {width}; height: {height}; border-radius: {radius};"
	aria-hidden="true"
></span>

<style lang="scss">
	.skeleton {
		display: block;
		background: linear-gradient(
			90deg,
			var(--neutral-tertiary) 25%,
			var(--neutral-quaternary) 37%,
			var(--neutral-tertiary) 63%
		);
		background-size: 400% 100%;
		animation: cj-shimmer 1.4s ease infinite;
	}
</style>
