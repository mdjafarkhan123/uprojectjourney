<script lang="ts">
	import { DatePicker } from 'bits-ui';
	import { parseDate, today, getLocalTimeZone, type DateValue } from '@internationalized/date';

	// Reusable date field built on bits-ui. Speaks ISO date strings ("yyyy-mm-dd")
	// on the outside (what our API/DB use) and CalendarDate on the inside (what
	// bits-ui wants). Content is portalled to <body>, so every class below is
	// global — component-scoped styles never reach portalled DOM.
	let {
		id,
		value,
		onChange,
		disabled = false,
		ariaLabel
	}: {
		id: string;
		value: string | null;
		onChange: (value: string | null) => void;
		disabled?: boolean;
		ariaLabel: string;
	} = $props();

	function toCalendarDate(iso: string | null): DateValue | undefined {
		if (!iso) return undefined;
		try {
			return parseDate(iso);
		} catch {
			return undefined;
		}
	}

	const selected = $derived(toCalendarDate(value));
	const placeholderDate = today(getLocalTimeZone());
</script>

<DatePicker.Root
	weekdayFormat="short"
	fixedWeeks
	{disabled}
	value={selected}
	placeholder={placeholderDate}
	onValueChange={(v) => onChange(v ? v.toString() : null)}
>
	<div class="dp">
		<DatePicker.Input {id} class="dp__field" aria-label={ariaLabel}>
			{#snippet children({ segments })}
				{#each segments as segment, i (segment.part + '-' + i)}
					{#if segment.part === 'literal'}
						<span class="dp__literal">{segment.value}</span>
					{:else}
						<DatePicker.Segment part={segment.part} class="dp__segment">
							{segment.value}
						</DatePicker.Segment>
					{/if}
				{/each}
			{/snippet}
		</DatePicker.Input>
		<DatePicker.Trigger class="dp__trigger" aria-label={`Open calendar for ${ariaLabel}`}>
			<i class="ri-calendar-line" aria-hidden="true"></i>
		</DatePicker.Trigger>
	</div>

	<DatePicker.Portal>
		<DatePicker.Content class="dp__content" sideOffset={6}>
			<DatePicker.Calendar class="dp__calendar">
				{#snippet children({ months, weekdays })}
					<DatePicker.Header class="dp__cal-header">
						<DatePicker.PrevButton class="dp__nav">
							<i class="ri-arrow-left-s-line" aria-hidden="true"></i>
						</DatePicker.PrevButton>
						<DatePicker.Heading class="dp__heading" />
						<DatePicker.NextButton class="dp__nav">
							<i class="ri-arrow-right-s-line" aria-hidden="true"></i>
						</DatePicker.NextButton>
					</DatePicker.Header>
					{#each months as month (month.value)}
						<DatePicker.Grid class="dp__grid">
							<DatePicker.GridHead>
								<DatePicker.GridRow class="dp__weekdays">
									{#each weekdays as day (day)}
										<DatePicker.HeadCell class="dp__weekday">{day.slice(0, 2)}</DatePicker.HeadCell>
									{/each}
								</DatePicker.GridRow>
							</DatePicker.GridHead>
							<DatePicker.GridBody>
								{#each month.weeks as weekDates (weekDates[0])}
									<DatePicker.GridRow class="dp__week">
										{#each weekDates as date (date)}
											<DatePicker.Cell {date} month={month.value} class="dp__cell">
												<DatePicker.Day class="dp__day" />
											</DatePicker.Cell>
										{/each}
									</DatePicker.GridRow>
								{/each}
							</DatePicker.GridBody>
						</DatePicker.Grid>
					{/each}
				{/snippet}
			</DatePicker.Calendar>
		</DatePicker.Content>
	</DatePicker.Portal>
</DatePicker.Root>

<style lang="scss">
	.dp {
		display: flex;
		align-items: center;
		gap: 4px;
		width: 100%;
		padding: 6px 8px 6px 12px;
		background-color: var(--neutral-secondary-medium);
		border: 1px solid var(--border-default-medium);
		border-radius: var(--radius-base);
		box-shadow: var(--shadow-xs);
		transition: all 200ms;

		&:hover {
			border-color: var(--border-default-strong);
		}

		// Focus lives on the inner segments; lift the ring to the whole control.
		&:focus-within {
			border-color: var(--border-brand);
			box-shadow: 0 0 0 1px var(--brand);
		}
	}

	// bits-ui renders these elements outside this component's scope, so target
	// them globally.
	:global(.dp__field) {
		display: flex;
		flex: 1;
		align-items: center;
		gap: 1px;
		font-size: 14px;
		color: var(--text-heading);
	}

	.dp__literal {
		color: var(--text-body);
	}

	:global(.dp__segment) {
		padding: 2px 3px;
		border-radius: var(--radius-sm, 4px);

		&:focus {
			outline: none;
			background-color: var(--brand-soft);
			color: var(--fg-brand-strong);
		}
	}

	:global(.dp__segment[data-placeholder]) {
		color: var(--text-body);
	}

	:global(.dp__trigger) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 4px;
		color: var(--text-body);
		background: transparent;
		border: none;
		border-radius: var(--radius-base);
		cursor: pointer;

		i {
			font-size: 18px;
		}

		&:hover:not([data-disabled]) {
			background-color: var(--neutral-tertiary-medium);
			color: var(--text-heading);
		}

		&:focus-visible {
			outline: none;
			box-shadow: 0 0 0 2px var(--brand);
		}
	}

	:global(.dp__content) {
		z-index: 60;
		padding: 12px;
		background-color: var(--neutral-primary);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-base);
		box-shadow: var(--shadow-lg);
	}

	:global(.dp__cal-header) {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 8px;
	}

	:global(.dp__heading) {
		font-size: 14px;
		font-weight: 600;
		color: var(--text-heading);
	}

	:global(.dp__nav) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		color: var(--text-body);
		background: transparent;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-base);
		cursor: pointer;

		i {
			font-size: 18px;
		}

		&:hover {
			background-color: var(--neutral-secondary-medium);
			color: var(--text-heading);
		}

		&:focus-visible {
			outline: none;
			box-shadow: 0 0 0 2px var(--brand);
		}
	}

	:global(.dp__grid) {
		width: 100%;
		border-collapse: collapse;
	}

	:global(.dp__weekday) {
		padding: 4px 0;
		font-size: 11px;
		font-weight: 500;
		color: var(--text-body-subtle);
	}

	:global(.dp__cell) {
		padding: 1px;
		text-align: center;
	}

	:global(.dp__day) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		font-size: 13px;
		color: var(--text-body);
		border-radius: var(--radius-base);
		cursor: pointer;
		user-select: none;

		&:hover {
			background-color: var(--neutral-secondary-medium);
			color: var(--text-heading);
		}

		&:focus-visible {
			outline: none;
			box-shadow: 0 0 0 2px var(--brand);
		}
	}

	:global(.dp__day[data-outside-month]) {
		color: var(--text-body-subtle);
		opacity: 0.5;
	}

	:global(.dp__day[data-selected]) {
		background-color: var(--brand);
		color: var(--white, #fff);
	}

	:global(.dp__day[data-today]:not([data-selected])) {
		border: 1px solid var(--border-brand);
	}
</style>
