<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Dialog } from 'bits-ui';

	type Props = {
		/** Whether the modal is shown. */
		open: boolean;
		/** Accessible title, rendered in the header. */
		title: string;
		/** Called when the user requests to close (Esc, overlay, or close button). */
		onclose: () => void;
		/** Modal body. */
		children: Snippet;
		/** Optional footer (action buttons). */
		footer?: Snippet;
	};

	let { open, title, onclose, children, footer }: Props = $props();

	// Parent owns `open`; forward any close request (Esc, outside click, close button).
	function handleOpenChange(next: boolean) {
		if (!next) onclose();
	}
</script>

<Dialog.Root {open} onOpenChange={handleOpenChange}>
	<Dialog.Portal>
		<Dialog.Overlay class="modal__overlay" />

		<Dialog.Content class="modal modal__dialog">
			<header class="modal__header">
				<Dialog.Title level={2} class="modal__title">{title}</Dialog.Title>
				<Dialog.Close class="modal__close" aria-label="Close">
					<i class="ri-close-line" aria-hidden="true"></i>
				</Dialog.Close>
			</header>

			<div class="modal__body">
				{@render children()}
			</div>

			{#if footer}
				<footer class="modal__footer">
					{@render footer()}
				</footer>
			{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style lang="scss">
	// bits-ui renders Overlay/Content as plain divs; we style them by class.
	// Overlay is fixed full-screen; Content is centered via fixed positioning.
	:global(.modal__overlay) {
		position: fixed;
		inset: 0;
		z-index: 40;
		background-color: rgb(0 0 0 / 0.5);
		backdrop-filter: blur(2px);
	}

	:global(.modal__dialog) {
		position: fixed;
		top: 50%;
		left: 50%;
		z-index: 41;
		transform: translate(-50%, -50%);
		display: flex;
		flex-direction: column;
		width: calc(100% - 48px);
		max-width: 440px;
		max-height: calc(100vh - 48px);
		background-color: var(--neutral-primary);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-base);
		box-shadow: var(--shadow-lg);

		&:focus {
			outline: none;
		}
	}

	// Header/body/footer live inside the portalled Content (rendered at
	// document.body), so scoped styles can't reach them — target globally.
	:global(.modal__header) {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 16px 20px;
		border-bottom: 1px solid var(--border-default);
	}

	:global(.modal__body) {
		padding: 24px 20px;
		overflow-y: auto;
		font-size: 16px;
		line-height: 1.625;
		color: var(--text-body);
	}

	:global(.modal__footer) {
		display: flex;
		justify-content: flex-end;
		gap: 12px;
		padding: 16px 20px;
		border-top: 1px solid var(--border-default);
	}

	// Title/Close are bits-ui components → target by global class.
	:global(.modal__title) {
		margin: 0;
		font-size: 20px;
		font-weight: 600;
		line-height: 1.3;
		color: var(--text-heading);
	}

	:global(.modal__close) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 6px;
		font-size: 20px;
		color: var(--text-heading);
		background-color: transparent;
		border: none;
		border-radius: var(--radius-base);
		cursor: pointer;
		transition: background-color 200ms;

		&:hover {
			background-color: var(--neutral-secondary-medium);
		}

		&:focus-visible {
			outline: none;
			box-shadow: 0 0 0 4px var(--neutral-tertiary);
		}
	}
</style>
