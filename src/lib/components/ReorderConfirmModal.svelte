<script lang="ts" generics="T extends ReorderRow">
	// The confirmation modal for every drag-to-reorder list. Driven entirely by a
	// `ReorderController` (from `$lib/data/reorder.svelte`) — pass it plus a plain-language
	// `noun` for what's being reordered ("templates", "milestones", "work items").
	import Modal from '$lib/components/Modal.svelte';
	import Button from '$lib/components/Button.svelte';
	import type { ReorderController, ReorderRow } from '$lib/data/reorder.svelte';

	type Props = {
		controller: ReorderController<T>;
		/** What's being reordered, e.g. "templates" — shown as "Save the new order of {noun}?". */
		noun: string;
	};

	let { controller, noun }: Props = $props();
</script>

<Modal open={controller.open} title="Save new order?" onclose={controller.cancel}>
	<div class="reorder-confirm">
		<i class="ri-drag-move-2-line reorder-confirm__icon" aria-hidden="true"></i>
		<p class="reorder-confirm__text">Save the new order of {noun}?</p>
		{#if controller.error}
			<div class="reorder-confirm__alert" role="alert">
				<i class="ri-error-warning-line" aria-hidden="true"></i>
				<span>{controller.error}</span>
			</div>
		{/if}
	</div>

	{#snippet footer()}
		<Button variant="secondary" onclick={controller.cancel} disabled={controller.saving}>
			Cancel
		</Button>
		<Button
			variant="primary"
			icon="ri-check-line"
			loading={controller.saving}
			loadingLabel="Saving…"
			onclick={controller.confirm}
		>
			Save order
		</Button>
	{/snippet}
</Modal>

<style lang="scss">
	.reorder-confirm {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		text-align: center;

		&__icon {
			font-size: 48px;
			color: var(--fg-brand);
		}

		&__text {
			margin: 0;
			font-size: 14px;
			line-height: 1.6;
			color: var(--text-body);
		}

		&__alert {
			display: flex;
			align-items: center;
			gap: 8px;
			width: 100%;
			padding: 12px;
			font-size: 14px;
			color: var(--fg-danger);
			background-color: var(--danger-soft);
			border: 1px solid var(--border-danger);
			border-radius: var(--radius-base);

			i {
				font-size: 16px;
			}
		}
	}
</style>
