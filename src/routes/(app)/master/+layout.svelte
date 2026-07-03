<script lang="ts">
	import Sidebar from '$lib/components/Sidebar.svelte';
	import Topbar from '$lib/components/Topbar.svelte';

	let { data, children } = $props();

	let sidebarOpen = $state(false);

	function closeSidebar() {
		sidebarOpen = false;
	}
</script>

{#if data.user && data.user.role === 'admin'}
	<div class="shell">
		<Sidebar open={sidebarOpen} onNavigate={closeSidebar} />

		{#if sidebarOpen}
			<button
				class="shell__scrim"
				type="button"
				aria-label="Close navigation menu"
				onclick={closeSidebar}
			></button>
		{/if}

		<div class="shell__main">
			<Topbar
				fullName={data.user.fullName}
				username={data.user.username}
				onToggleSidebar={() => (sidebarOpen = !sidebarOpen)}
			/>
			<main class="shell__content">
				{@render children()}
			</main>
		</div>
	</div>
{:else}
	<!-- Logged out: render the bare login page with no shell chrome. -->
	{@render children()}
{/if}

<style lang="scss">
	.shell {
		display: flex;
		min-height: 100vh;
		background-color: var(--neutral-secondary-soft);

		&__main {
			display: flex;
			flex-direction: column;
			flex: 1;
			min-width: 0;
		}

		&__content {
			flex: 1;
			padding: 32px 24px;
		}

		// Mobile overlay behind the off-canvas sidebar.
		&__scrim {
			position: fixed;
			inset: 0;
			z-index: 30;
			display: none;
			padding: 0;
			background-color: rgb(0 0 0 / 0.4);
			border: none;
			cursor: pointer;
		}

		@media (max-width: 768px) {
			&__content {
				padding: 24px 16px;
			}

			&__scrim {
				display: block;
			}
		}
	}
</style>
