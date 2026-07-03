<script lang="ts">
	import { page } from '$app/state';

	// Shown when the public journey can't be loaded — most often a 404 (the link is
	// wrong, or the admin turned public sharing off). No branding here: the layout
	// load failed, so we don't have the owning admin's colours.
	const is404 = $derived(page.status === 404);
</script>

<svelte:head>
	<title>{is404 ? 'Link not available' : 'Something went wrong'}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="wrap">
	<div class="state">
		<i
			class={is404 ? 'ri-links-line' : 'ri-error-warning-line'}
			aria-hidden="true"
			style="font-size:40px;color:var(--text-body-subtle);"
		></i>
		<h1 class="state__title">
			{is404 ? 'This link isn’t available' : 'Something went wrong'}
		</h1>
		<p class="state__text">
			{#if is404}
				The project you’re looking for isn’t shared publicly, or the link has changed. Please check
				with the person who sent it to you.
			{:else}
				{page.error?.message ?? 'Please try again in a moment.'}
			{/if}
		</p>
	</div>
</main>

<style lang="scss">
	.wrap {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		padding: 24px;
		background-color: var(--neutral-secondary-soft);
	}

	.state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		max-width: 420px;
		padding: 48px 32px;
		text-align: center;
		background-color: var(--neutral-primary-soft);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-base);
		box-shadow: var(--shadow-xs);

		&__title {
			margin: 4px 0 0;
			font-size: 20px;
			font-weight: 600;
			color: var(--text-heading);
		}

		&__text {
			margin: 0;
			font-size: 14px;
			line-height: 1.6;
			color: var(--text-body);
		}
	}
</style>
