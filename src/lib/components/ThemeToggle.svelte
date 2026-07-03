<script lang="ts">
	import { onMount } from 'svelte';
	import { theme, type Theme } from '$lib/theme.svelte';

	// Icon + label per mode. Clicking cycles System → Light → Dark.
	const META: Record<Theme, { icon: string; label: string }> = {
		system: { icon: 'ri-computer-line', label: 'System' },
		light: { icon: 'ri-sun-line', label: 'Light' },
		dark: { icon: 'ri-moon-line', label: 'Dark' }
	};

	// Read the persisted preference once the DOM is available.
	onMount(() => theme.init());

	const meta = $derived(META[theme.current]);
</script>

<button
	class="theme-toggle"
	type="button"
	onclick={() => theme.cycle()}
	title={`Theme: ${meta.label} (click to change)`}
	aria-label={`Theme: ${meta.label}. Click to change.`}
>
	<i class={meta.icon} aria-hidden="true"></i>
	<span class="theme-toggle__label">Theme</span>
</button>

<style lang="scss">
	.theme-toggle {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		height: 40px;
		padding: 0 14px;
		font-size: 20px;
		color: var(--text-heading);
		background-color: var(--neutral-secondary-medium);
		border: 1px solid var(--border-default-medium);
		border-radius: var(--radius-base);
		box-shadow: var(--shadow-xs);
		cursor: pointer;
		transition:
			color 200ms,
			background-color 200ms;

		&__label {
			font-size: 14px;
			font-weight: 500;
			line-height: 1;
		}

		&:hover {
			background-color: var(--neutral-tertiary-medium);
		}

		&:focus-visible {
			outline: none;
			box-shadow: 0 0 0 3px var(--brand-medium);
		}
	}
</style>
