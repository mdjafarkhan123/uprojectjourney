<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Button from '$lib/components/Button.svelte';

	let fullName = $state('');
	let email = $state('');
	let username = $state('');
	let password = $state('');
	let loading = $state(false);
	let errorMessage = $state('');
	// Per-field errors returned by the API (e.g. taken username/email).
	let fieldErrors = $state<Record<string, string[]>>({});

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (loading) return;

		loading = true;
		errorMessage = '';
		fieldErrors = {};

		try {
			const res = await fetch('/api/auth/signup', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ fullName, email, username, password })
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				errorMessage = data.message ?? 'Something went wrong. Please try again.';
				fieldErrors = data.errors ?? {};
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

<div class="signup">
	<div class="signup__card">
		<header class="signup__header">
			<h1 class="signup__heading">Create your admin account</h1>
			<p class="signup__subheading">Set up your workspace to manage projects and clients.</p>
		</header>

		{#if errorMessage}
			<div class="signup__alert" role="alert">
				<i class="ri-error-warning-line signup__alert-icon" aria-hidden="true"></i>
				<span>{errorMessage}</span>
			</div>
		{/if}

		<form class="signup__form" onsubmit={submit} novalidate>
			<div class="signup__field">
				<label class="signup__label" for="fullName">Full name</label>
				<div class="signup__input-wrap">
					<i class="ri-user-line signup__input-icon" aria-hidden="true"></i>
					<input
						id="fullName"
						class="signup__input"
						type="text"
						name="fullName"
						autocomplete="name"
						bind:value={fullName}
						disabled={loading}
						required
					/>
				</div>
				{#if fieldErrors.fullName?.length}
					<p class="signup__field-error">{fieldErrors.fullName[0]}</p>
				{/if}
			</div>

			<div class="signup__field">
				<label class="signup__label" for="email">Email</label>
				<div class="signup__input-wrap">
					<i class="ri-mail-line signup__input-icon" aria-hidden="true"></i>
					<input
						id="email"
						class="signup__input"
						type="email"
						name="email"
						autocomplete="email"
						bind:value={email}
						disabled={loading}
						required
					/>
				</div>
				{#if fieldErrors.email?.length}
					<p class="signup__field-error">{fieldErrors.email[0]}</p>
				{/if}
			</div>

			<div class="signup__field">
				<label class="signup__label" for="username">Username</label>
				<div class="signup__input-wrap">
					<i class="ri-at-line signup__input-icon" aria-hidden="true"></i>
					<input
						id="username"
						class="signup__input"
						type="text"
						name="username"
						autocomplete="username"
						bind:value={username}
						disabled={loading}
						required
					/>
				</div>
				{#if fieldErrors.username?.length}
					<p class="signup__field-error">{fieldErrors.username[0]}</p>
				{/if}
			</div>

			<div class="signup__field">
				<label class="signup__label" for="password">Password</label>
				<div class="signup__input-wrap">
					<i class="ri-lock-2-line signup__input-icon" aria-hidden="true"></i>
					<input
						id="password"
						class="signup__input"
						type="password"
						name="password"
						autocomplete="new-password"
						bind:value={password}
						disabled={loading}
						required
					/>
				</div>
				{#if fieldErrors.password?.length}
					<p class="signup__field-error">{fieldErrors.password[0]}</p>
				{/if}
			</div>

			<Button
				variant="primary"
				size="lg"
				type="submit"
				fullWidth
				icon="ri-user-add-line"
				{loading}
				loadingLabel="Creating account…"
			>
				Create account
			</Button>
		</form>

		<p class="signup__aside">
			Already have an account?
			<a class="signup__link" href={resolve('/master')}>Sign in</a>
		</p>
	</div>
</div>

<style lang="scss">
	.signup {
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

		&__aside {
			margin: 20px 0 0;
			font-size: 14px;
			text-align: center;
			color: var(--text-body);
		}

		&__link {
			font-weight: 500;
			color: var(--fg-brand);
			text-decoration: none;

			&:hover {
				text-decoration: underline;
			}

			&:focus-visible {
				outline: 2px solid var(--brand);
				outline-offset: 2px;
				border-radius: var(--radius-sm);
			}
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

		&__field-error {
			margin: 6px 0 0;
			font-size: 13px;
			color: var(--fg-danger);
		}
	}
</style>
