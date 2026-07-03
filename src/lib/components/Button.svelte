<script lang="ts">
	// The one button for the client journey. Every portal button is one of two looks
	// (brand-filled `primary`, neutral `secondary`) at one of three sizes. It renders a
	// real <button> normally, or an <a> when `href` is set (so "back" links share the
	// exact same shape). `loading` swaps the leading icon for a spinner, disables the
	// control and optionally shows `loadingLabel`. The spinner and hover shades are
	// derived from `currentColor`, so both variants animate correctly with no per-use CSS.
	import type { Snippet } from 'svelte';

	type Props = {
		variant?: 'primary' | 'secondary';
		size?: 'sm' | 'md' | 'lg';
		/** Leading RemixIcon class, e.g. 'ri-login-box-line'. Hidden while loading. */
		icon?: string;
		/** Show a spinner, disable the control, and swap in loadingLabel if given. */
		loading?: boolean;
		/** Text to show in place of the label while loading (e.g. 'Signing in…'). */
		loadingLabel?: string;
		disabled?: boolean;
		/** Stretch to the full width of the container (e.g. the login submit). */
		fullWidth?: boolean;
		/** Hide the text label at ≤768px, leaving just the icon/spinner. */
		collapseLabel?: boolean;
		/** Render as an <a> to this href instead of a <button>. */
		href?: string;
		type?: 'button' | 'submit' | 'reset';
		/** Accessible name — required when collapseLabel may hide the visible text. */
		ariaLabel?: string;
		onclick?: (event: MouseEvent) => void;
		children: Snippet;
	};

	let {
		variant = 'secondary',
		size = 'md',
		icon,
		loading = false,
		loadingLabel,
		disabled = false,
		fullWidth = false,
		collapseLabel = false,
		href,
		type = 'button',
		ariaLabel,
		onclick,
		children
	}: Props = $props();

	const isLink = $derived(href !== undefined);
	// A link can't be `disabled`; a loading/disabled link drops its href so it's inert.
	const inert = $derived(disabled || loading);
</script>

{#snippet content()}
	{#if loading}
		<span class="btn__spinner" aria-hidden="true"></span>
	{:else if icon}
		<i class={icon} aria-hidden="true"></i>
	{/if}
	<span class="btn__label">
		{#if loading && loadingLabel}{loadingLabel}{:else}{@render children()}{/if}
	</span>
{/snippet}

{#if isLink}
	<!-- Loading/disabled link drops its href so it's inert but still visible. -->
	<a
		class="btn btn--{variant} btn--{size}"
		class:btn--full={fullWidth}
		class:btn--collapse={collapseLabel}
		class:btn--loading={loading}
		href={inert ? undefined : href}
		aria-disabled={inert ? 'true' : undefined}
		aria-busy={loading ? 'true' : undefined}
		aria-label={ariaLabel}
		{onclick}
	>
		{@render content()}
	</a>
{:else}
	<button
		class="btn btn--{variant} btn--{size}"
		class:btn--full={fullWidth}
		class:btn--collapse={collapseLabel}
		class:btn--loading={loading}
		{type}
		disabled={inert}
		aria-busy={loading ? 'true' : undefined}
		aria-label={ariaLabel}
		{onclick}
	>
		{@render content()}
	</button>
{/if}

<style lang="scss">
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		font-family: inherit;
		font-weight: 500;
		border: 1px solid transparent;
		border-radius: var(--radius-base);
		cursor: pointer;
		text-decoration: none;
		transition:
			color 200ms,
			background-color 200ms;

		i {
			font-size: 1.14em;
			line-height: 1;
		}

		&:disabled,
		&[aria-disabled='true'] {
			cursor: not-allowed;
			opacity: 0.85;
			pointer-events: none;
		}

		// --- Sizes ---
		&--sm {
			padding: 8px 14px;
			font-size: 14px;
		}

		&--md {
			padding: 10px 16px;
			font-size: 14px;
		}

		&--lg {
			padding: 12px 20px;
			font-size: 16px;
		}

		&--full {
			width: 100%;
		}

		// --- Variants ---
		&--secondary {
			color: var(--text-body);
			background-color: var(--neutral-secondary-medium);
			border-color: var(--border-default-medium);
			box-shadow: var(--shadow-xs);

			&:hover:not(:disabled):not([aria-disabled='true']) {
				color: var(--text-heading);
				background-color: var(--neutral-tertiary-medium);
			}

			&:focus-visible {
				outline: none;
				box-shadow: 0 0 0 3px var(--brand-medium);
			}
		}

		&--primary {
			color: var(--text-white);
			background-color: var(--brand);
			box-shadow:
				var(--shadow-xs),
				inset var(--color-1-400) 0 6px 0px -5px,
				var(--color-1-700) 0 4px 10px -5px;

			&:hover:not(:disabled):not([aria-disabled='true']) {
				background-color: var(--brand-strong);
			}

			&:focus-visible {
				outline: none;
				box-shadow: 0 0 0 4px var(--brand-medium);
			}
		}

		// Spinner: borrows the button's text colour so it reads on either variant.
		&__spinner {
			width: 1em;
			height: 1em;
			border: 2px solid color-mix(in srgb, currentColor 30%, transparent);
			border-top-color: currentColor;
			border-radius: var(--radius-full);
			animation: cj-spin 700ms linear infinite;
		}

		&__label {
			line-height: 1.2;
		}

		@media (max-width: 768px) {
			&--collapse .btn__label {
				display: none;
			}
		}
	}
</style>
