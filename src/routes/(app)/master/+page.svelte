<script lang="ts">
	import LoginForm from '$lib/components/LoginForm.svelte';
	import { resolve } from '$app/paths';

	let { data } = $props();
</script>

<svelte:head>
	<title>{data.user?.role === 'admin' ? 'Dashboard' : 'Admin sign in'}</title>
</svelte:head>

{#if data.user && data.user.role === 'admin'}
	<section class="dashboard">
		<header class="dashboard__header">
			<h1 class="dashboard__heading">Welcome back, {data.user.fullName}</h1>
			<p class="dashboard__subheading">Here's an overview of your workspace.</p>
		</header>

		<div class="dashboard__grid">
			<a class="stat" href={resolve('/master/clients')}>
				<span class="stat__icon-wrap">
					<i class="ri-team-line stat__icon" aria-hidden="true"></i>
				</span>
				<span class="stat__body">
					<span class="stat__value">{data.clientCount ?? 0}</span>
					<span class="stat__label">Clients</span>
				</span>
				<i class="ri-arrow-right-line stat__chevron" aria-hidden="true"></i>
			</a>
		</div>
	</section>
{:else}
	<LoginForm
		intent="admin"
		heading="Admin sign in"
		subheading="Sign in to manage projects and clients."
	/>
{/if}

<style lang="scss">
	.dashboard {
		&__header {
			margin-bottom: 32px;
		}

		&__heading {
			margin: 0 0 8px;
			font-size: 24px;
			font-weight: 600;
			line-height: 1.25;
			color: var(--text-heading);
		}

		&__subheading {
			margin: 0;
			font-size: 14px;
			color: var(--text-body);
		}

		&__grid {
			display: grid;
			grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
			gap: 24px;
		}
	}

	.stat {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 20px;
		text-decoration: none;
		background-color: var(--neutral-primary-soft);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-base);
		box-shadow: var(--shadow-xs);
		transition:
			border-color 200ms,
			box-shadow 200ms;

		&:hover {
			border-color: var(--border-default-strong);
			box-shadow: var(--shadow-sm);
		}

		&:focus-visible {
			outline: none;
			box-shadow: 0 0 0 3px var(--brand-medium);
		}

		&__icon-wrap {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 44px;
			height: 44px;
			background-color: var(--brand-softer);
			border-radius: var(--radius-base);
		}

		&__icon {
			font-size: 22px;
			color: var(--fg-brand);
		}

		&__body {
			display: flex;
			flex-direction: column;
			flex: 1;
			min-width: 0;
		}

		&__value {
			font-size: 24px;
			font-weight: 600;
			line-height: 1.1;
			color: var(--text-heading);
		}

		&__label {
			font-size: 13px;
			color: var(--text-body-subtle);
		}

		&__chevron {
			font-size: 18px;
			color: var(--text-body-subtle);
		}
	}
</style>
