<script lang="ts">
	import { goto } from '$app/navigation';
	import Button from '$lib/components/Button.svelte';

	type Props = {
		intent: 'admin' | 'client';
		heading: string;
		subheading: string;
	};

	let { intent, heading, subheading }: Props = $props();

	let username = $state('');
	let password = $state('');
	let loading = $state(false);
	let errorMessage = $state('');

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (loading) return;

		loading = true;
		errorMessage = '';

		try {
			const res = await fetch('/api/auth/login', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ username, password, intent })
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				errorMessage = data.message ?? 'Something went wrong. Please try again.';
				loading = false;
				return;
			}

			const { redirectTo } = await res.json();
			await goto(redirectTo, { invalidateAll: true });
		} catch {
			errorMessage = 'Could not reach the server. Please try again.';
			loading = false;
		}
	}
</script>

<div class="login">
	<div class="login__card">
		<header class="login__header">
			<h1 class="login__heading">{heading}</h1>
			<p class="login__subheading">{subheading}</p>
		</header>

		{#if errorMessage}
			<div class="login__alert" role="alert">
				<i class="ri-error-warning-line login__alert-icon" aria-hidden="true"></i>
				<span>{errorMessage}</span>
			</div>
		{/if}

		<form class="login__form" onsubmit={submit} novalidate>
			<div class="login__field">
				<label class="login__label" for="username">Username</label>
				<div class="login__input-wrap">
					<i class="ri-user-line login__input-icon" aria-hidden="true"></i>
					<input
						id="username"
						class="login__input"
						type="text"
						name="username"
						autocomplete="username"
						bind:value={username}
						disabled={loading}
						required
					/>
				</div>
			</div>

			<div class="login__field">
				<label class="login__label" for="password">Password</label>
				<div class="login__input-wrap">
					<i class="ri-lock-2-line login__input-icon" aria-hidden="true"></i>
					<input
						id="password"
						class="login__input"
						type="password"
						name="password"
						autocomplete="current-password"
						bind:value={password}
						disabled={loading}
						required
					/>
				</div>
			</div>

			<Button
				variant="primary"
				size="lg"
				type="submit"
				fullWidth
				icon="ri-login-box-line"
				loading={loading}
				loadingLabel="Signing in…"
			>
				Sign in
			</Button>
		</form>
	</div>
</div>

<style lang="scss">
	.login {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		padding: 24px;
		background-color: var(--neutral-secondary-soft);

		&__card {
			width: 100%;
			max-width: 400px;
			padding: 32px;
			background-color: var(--neutral-primary-soft);
			border: 1px solid var(--border-default);
			border-radius: var(--radius-base);
			box-shadow: var(--shadow-md);
		}

		&__header {
			margin-bottom: 24px;
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
			line-height: 1.6;
			color: var(--text-body);
		}

		&__alert {
			display: flex;
			align-items: flex-start;
			gap: 8px;
			margin-bottom: 16px;
			padding: 12px;
			font-size: 14px;
			color: var(--fg-danger);
			background-color: var(--danger-soft);
			border: 1px solid var(--border-danger);
			border-radius: var(--radius-base);
		}

		&__alert-icon {
			font-size: 16px;
			line-height: 1.6;
		}

		&__form {
			display: flex;
			flex-direction: column;
			gap: 16px;
		}

		&__label {
			display: block;
			margin-bottom: 8px;
			font-size: 14px;
			font-weight: 500;
			color: var(--text-heading);
		}

		&__input-wrap {
			position: relative;
		}

		&__input-icon {
			position: absolute;
			top: 50%;
			left: 12px;
			transform: translateY(-50%);
			font-size: 16px;
			color: var(--text-body);
			pointer-events: none;
		}

		&__input {
			display: block;
			width: 100%;
			padding: 10px 12px 10px 36px;
			font-family: inherit;
			font-size: 14px;
			color: var(--text-heading);
			background-color: var(--neutral-secondary-medium);
			border: 1px solid var(--border-default-medium);
			border-radius: var(--radius-base);
			box-shadow: var(--shadow-xs);
			transition: all 200ms;

			&::placeholder {
				color: var(--text-body);
			}

			&:hover:not(:disabled) {
				border-color: var(--border-default-strong);
			}

			&:focus {
				outline: none;
				border-color: var(--border-brand);
				box-shadow: 0 0 0 1px var(--brand);
			}

			&:disabled {
				background-color: var(--disabled);
				color: var(--fg-disabled);
				cursor: not-allowed;
			}
		}

	}
</style>
