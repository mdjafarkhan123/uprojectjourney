<script lang="ts">
	import { Dialog } from 'bits-ui';

	// The "Live preview" links panel, split out of ProjectJourney so bits-ui is
	// dynamically imported (loaded only when the client actually opens the panel),
	// keeping it off the public/client page's initial hydration bundle. The trigger
	// pill lives in ProjectJourney (plain SSR button); this component is the panel,
	// controlled via `bind:open`. Styling comes from the `:global(.preview-*)` rules
	// in ProjectJourney, so the markup here only needs the class names.
	type PreviewLink = {
		id: string;
		url: string;
		label: string;
		updateTitle: string;
	};

	let { links, open = $bindable() }: { links: PreviewLink[]; open: boolean } = $props();

	// Bare host of a link, shown as a lightweight "where this goes" cue. Falls back
	// to the raw string if it somehow isn't a parseable URL.
	function linkHost(url: string): string {
		try {
			return new URL(url).host;
		} catch {
			return url;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay class="preview-overlay" />
		<Dialog.Content class="preview-sheet">
			<div class="preview-sheet__head">
				<Dialog.Title class="preview-sheet__title">
					<i class="ri-global-line" aria-hidden="true"></i>
					Live preview links
				</Dialog.Title>
				<Dialog.Close class="preview-sheet__close" aria-label="Close">
					<i class="ri-close-line" aria-hidden="true"></i>
				</Dialog.Close>
			</div>
			<ul class="preview-list">
				{#each links as link (link.id)}
					<li class="preview-list__item">
						<!-- Admin-authored external URL in a new tab — resolve() is for internal routes only. -->
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
						<a class="preview-link" href={link.url} target="_blank" rel="noopener noreferrer">
							<span class="preview-link__body">
								<span class="preview-link__label">{link.label}</span>
								<span class="preview-link__host">{linkHost(link.url)}</span>
								<span class="preview-link__source">from “{link.updateTitle}”</span>
							</span>
							<i class="ri-external-link-line preview-link__icon" aria-hidden="true"></i>
						</a>
					</li>
				{/each}
			</ul>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
