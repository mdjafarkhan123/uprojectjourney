<script lang="ts">
	// Circular progress marker (percentage in the centre, ring around it) styled after
	// `reference/progressbar.png`. Built with a CSS `conic-gradient` — NOT an SVG — so it
	// honours the "no raw SVG" rule. The filled arc's colour shifts gradually from amber
	// toward green as progress rises, so a glance at the hue reads as "how far along".
	type Props = {
		/** Progress 0–100. Clamped defensively. */
		value: number;
		/** Outer diameter in px. */
		size?: number;
		/** Ring thickness in px. */
		thickness?: number;
		/** Colour filling the centre cut-out — match the surface the ring sits on. */
		centerColor?: string;
	};

	let {
		value,
		size = 56,
		thickness = 5,
		centerColor = 'var(--neutral-primary-soft)'
	}: Props = $props();

	const pct = $derived(Math.max(0, Math.min(100, Math.round(value))));

	// Amber (hue ~40) at low progress → green (hue ~145) at full. Fixed saturation +
	// lightness so it reads the same in light and dark themes.
	const arcColor = $derived(`hsl(${40 + 1.05 * pct} 72% 45%)`);
</script>

<span
	class="ring"
	style="--ring-size: {size}px; --ring-thickness: {thickness}px; --ring-pct: {pct}; --ring-arc: {arcColor}; --ring-center: {centerColor};"
	role="img"
	aria-label="{pct}% complete"
>
	<span class="ring__label">{pct}%</span>
</span>

<style lang="scss">
	.ring {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: var(--ring-size);
		height: var(--ring-size);
		border-radius: var(--radius-full);
		/* Filled arc up to --ring-pct, remaining track stays a soft grey (as in the reference). */
		background: conic-gradient(
			var(--ring-arc) calc(var(--ring-pct) * 1%),
			var(--neutral-tertiary-medium) 0
		);

		/* Cut out the centre so only the ring band shows. */
		&::before {
			content: '';
			position: absolute;
			inset: var(--ring-thickness);
			border-radius: var(--radius-full);
			background-color: var(--ring-center);
		}

		&__label {
			position: relative;
			z-index: 1;
			font-size: 11px;
			font-weight: 700;
			font-variant-numeric: tabular-nums;
			line-height: 1;
			color: var(--text-heading);
		}
	}
</style>
