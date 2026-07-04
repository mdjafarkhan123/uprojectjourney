<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { goto, invalidateAll } from '$app/navigation';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import TemplatesTab from '$lib/components/TemplatesTab.svelte';
	import { query } from '$lib/data/cache.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Branding = {
		admin_id: string;
		company_name: string | null;
		logo_url: string | null;
		primary_color: string | null;
		updated_at: string | null;
	};

	// A sensible default for the native color picker when no brand color is set —
	// this is display-only; the stored value stays empty unless the admin picks one.
	const COLOR_FALLBACK = '#2563eb';

	// --- Tabs (state mirrored into ?tab= so it survives refresh and is linkable).
	// Pure client-side: the layout load reads nothing from `url`, so switching tabs
	// never triggers a server round-trip. ---
	type Tab = 'general' | 'branding' | 'templates';
	const tabs: { id: Tab; label: string; icon: string }[] = [
		{ id: 'general', label: 'General', icon: 'ri-user-settings-line' },
		{ id: 'branding', label: 'Branding', icon: 'ri-palette-line' },
		{ id: 'templates', label: 'Templates', icon: 'ri-stack-line' }
	];

	function tabFromUrl(): Tab {
		const t = page.url.searchParams.get('tab');
		return t === 'branding' || t === 'templates' ? t : 'general';
	}
	let activeTab = $state<Tab>(tabFromUrl());

	function selectTab(t: Tab) {
		activeTab = t;
		const href =
			t === 'branding'
				? resolve('/master/settings?tab=branding')
				: t === 'templates'
					? resolve('/master/settings?tab=templates')
					: resolve('/master/settings');
		goto(href, { replaceState: true, keepFocus: true, noScroll: true });
	}

	// --- Profile (seeded once from the already-SSR'd layout data — no extra fetch).
	// We deliberately capture only the initial values (untrack); the form owns its
	// own state after that and shouldn't reset when layout data revalidates. ---
	let fullName = $state(untrack(() => data.user?.fullName ?? ''));
	let username = $state(untrack(() => data.user?.username ?? ''));
	let password = $state('');
	let savingProfile = $state(false);
	let profileError = $state('');
	let profileSaved = $state(false);
	let profileFieldErrors = $state<{ fullName?: string; username?: string; password?: string }>({});

	async function submitProfile(event: SubmitEvent) {
		event.preventDefault();
		if (savingProfile) return;
		savingProfile = true;
		profileError = '';
		profileSaved = false;
		profileFieldErrors = {};

		const body: { fullName: string; username: string; password?: string } = {
			fullName,
			username
		};
		if (password.trim()) body.password = password;

		try {
			const res = await fetch('/api/profile', {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			const payload = await res.json().catch(() => ({}));

			if (!res.ok) {
				const errs = payload.errors ?? {};
				profileFieldErrors = {
					fullName: errs.fullName?.[0],
					username: errs.username?.[0],
					password: errs.password?.[0]
				};
				profileError = payload.message ?? 'Something went wrong. Please try again.';
				savingProfile = false;
				return;
			}

			password = '';
			profileSaved = true;
			savingProfile = false;
			// Refresh layout data so the Topbar name/username update immediately.
			await invalidateAll();
		} catch {
			profileError = 'Could not reach the server. Please try again.';
			savingProfile = false;
		}
	}

	// --- Branding (client-fetched + cached, patched on save) ---
	const brandingQ = query<Branding | null>('branding', async () => {
		const res = await fetch('/api/branding');
		if (!res.ok) throw new Error('Could not load your branding.');
		const body = await res.json();
		return (body.branding ?? null) as Branding | null;
	});

	let companyName = $state('');
	let logoUrl = $state('');
	let primaryColor = $state('');
	let brandingReady = $state(false);
	let savingBranding = $state(false);
	let brandingError = $state('');
	let brandingSaved = $state(false);
	let brandingFieldErrors = $state<{
		companyName?: string;
		logoUrl?: string;
		primaryColor?: string;
	}>({});

	// Seed the form once the branding row has loaded (or resolved to null).
	$effect(() => {
		if (brandingReady) return;
		if (brandingQ.data !== undefined) {
			const b = brandingQ.data;
			companyName = b?.company_name ?? '';
			logoUrl = b?.logo_url ?? '';
			primaryColor = b?.primary_color ?? '';
			brandingReady = true;
		}
	});

	async function submitBranding(event: SubmitEvent) {
		event.preventDefault();
		if (savingBranding) return;
		savingBranding = true;
		brandingError = '';
		brandingSaved = false;
		brandingFieldErrors = {};

		try {
			const res = await fetch('/api/branding', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ companyName, logoUrl, primaryColor })
			});
			const payload = await res.json().catch(() => ({}));

			if (!res.ok) {
				const errs = payload.errors ?? {};
				brandingFieldErrors = {
					companyName: errs.companyName?.[0],
					logoUrl: errs.logoUrl?.[0],
					primaryColor: errs.primaryColor?.[0]
				};
				brandingError = payload.message ?? 'Something went wrong. Please try again.';
				savingBranding = false;
				return;
			}

			brandingQ.set(() => (payload.branding ?? null) as Branding | null);
			brandingSaved = true;
			savingBranding = false;
		} catch {
			brandingError = 'Could not reach the server. Please try again.';
			savingBranding = false;
		}
	}
</script>

<svelte:head>
	<title>Settings</title>
</svelte:head>

<section class="page">
	<header class="page__header">
		<div>
			<h1 class="page__heading">Settings</h1>
			<p class="page__subheading">
				Manage your profile, the branding your clients see, and your project templates.
			</p>
		</div>
	</header>

	<div class="tabs" role="tablist" aria-label="Settings sections">
		{#each tabs as tab (tab.id)}
			<button
				class="tabs__tab"
				class:tabs__tab--active={activeTab === tab.id}
				type="button"
				role="tab"
				aria-selected={activeTab === tab.id}
				onclick={() => selectTab(tab.id)}
			>
				<i class={tab.icon} aria-hidden="true"></i>
				<span>{tab.label}</span>
			</button>
		{/each}
	</div>

	{#if activeTab === 'general'}
		<section class="card card--form" aria-labelledby="profile-heading">
			<div class="card__head">
				<h2 class="card__title" id="profile-heading">Profile</h2>
				<p class="card__desc">Your name and sign-in details.</p>
			</div>

			<form class="form" onsubmit={submitProfile} novalidate>
				{#if profileError}
					<div class="form__alert" role="alert">
						<i class="ri-error-warning-line" aria-hidden="true"></i>
						<span>{profileError}</span>
					</div>
				{/if}
				{#if profileSaved}
					<div class="form__success" role="status">
						<i class="ri-check-line" aria-hidden="true"></i>
						<span>Profile saved.</span>
					</div>
				{/if}

				<div class="form__field">
					<label class="form__label" for="profile-fullname">Full name</label>
					<input
						id="profile-fullname"
						class="form__input"
						class:form__input--error={profileFieldErrors.fullName}
						type="text"
						autocomplete="name"
						bind:value={fullName}
						disabled={savingProfile}
						required
					/>
					{#if profileFieldErrors.fullName}
						<p class="form__error">{profileFieldErrors.fullName}</p>
					{/if}
				</div>

				<div class="form__field">
					<label class="form__label" for="profile-username">Username</label>
					<input
						id="profile-username"
						class="form__input"
						class:form__input--error={profileFieldErrors.username}
						type="text"
						autocomplete="username"
						autocapitalize="none"
						spellcheck="false"
						bind:value={username}
						disabled={savingProfile}
						required
					/>
					{#if profileFieldErrors.username}
						<p class="form__error">{profileFieldErrors.username}</p>
					{:else}
						<p class="form__hint">You sign in with this. Letters, numbers, and . _ -</p>
					{/if}
				</div>

				<div class="form__field">
					<label class="form__label" for="profile-password">New password</label>
					<input
						id="profile-password"
						class="form__input"
						class:form__input--error={profileFieldErrors.password}
						type="password"
						autocomplete="new-password"
						bind:value={password}
						disabled={savingProfile}
					/>
					{#if profileFieldErrors.password}
						<p class="form__error">{profileFieldErrors.password}</p>
					{:else}
						<p class="form__hint">Leave blank to keep your current password.</p>
					{/if}
				</div>

				<div class="form__actions">
					<button class="btn btn--brand" type="submit" disabled={savingProfile}>
						{#if savingProfile}
							<span class="btn__spinner" aria-hidden="true"></span>
							<span>Saving…</span>
						{:else}
							<i class="ri-check-line" aria-hidden="true"></i>
							<span>Save profile</span>
						{/if}
					</button>
				</div>
			</form>
		</section>
	{:else if activeTab === 'branding'}
		<section class="card card--form" aria-labelledby="branding-heading">
			<div class="card__head">
				<h2 class="card__title" id="branding-heading">Branding</h2>
				<p class="card__desc">
					Shown to your clients in their portal. The brand color themes their view.
				</p>
			</div>

			{#if brandingQ.error}
				<div class="form__alert" role="alert">
					<i class="ri-error-warning-line" aria-hidden="true"></i>
					<span>{brandingQ.error}</span>
					<button class="btn btn--sm btn--secondary" type="button" onclick={() => brandingQ.load()}>
						Try again
					</button>
				</div>
			{:else if !brandingReady}
				<div class="form">
					<div class="form__field">
						<Skeleton width="90px" height="14px" />
						<Skeleton height="40px" radius="var(--radius-base)" />
					</div>
					<div class="form__field">
						<Skeleton width="90px" height="14px" />
						<Skeleton height="40px" radius="var(--radius-base)" />
					</div>
					<div class="form__field">
						<Skeleton width="90px" height="14px" />
						<Skeleton height="40px" radius="var(--radius-base)" />
					</div>
				</div>
			{:else}
				<form class="form" onsubmit={submitBranding} novalidate>
					{#if brandingError}
						<div class="form__alert" role="alert">
							<i class="ri-error-warning-line" aria-hidden="true"></i>
							<span>{brandingError}</span>
						</div>
					{/if}
					{#if brandingSaved}
						<div class="form__success" role="status">
							<i class="ri-check-line" aria-hidden="true"></i>
							<span>Branding saved.</span>
						</div>
					{/if}

					<div class="form__field">
						<label class="form__label" for="branding-company">Company name</label>
						<input
							id="branding-company"
							class="form__input"
							class:form__input--error={brandingFieldErrors.companyName}
							type="text"
							bind:value={companyName}
							disabled={savingBranding}
							placeholder="Acme Studio"
						/>
						{#if brandingFieldErrors.companyName}
							<p class="form__error">{brandingFieldErrors.companyName}</p>
						{/if}
					</div>

					<div class="form__field">
						<label class="form__label" for="branding-logo">Logo URL</label>
						<input
							id="branding-logo"
							class="form__input"
							class:form__input--error={brandingFieldErrors.logoUrl}
							type="url"
							inputmode="url"
							autocapitalize="none"
							spellcheck="false"
							bind:value={logoUrl}
							disabled={savingBranding}
							placeholder="https://…/logo.png"
						/>
						{#if brandingFieldErrors.logoUrl}
							<p class="form__error">{brandingFieldErrors.logoUrl}</p>
						{:else}
							<p class="form__hint">Paste a link to your logo. File upload is coming later.</p>
						{/if}
					</div>

					<div class="form__field">
						<label class="form__label" for="branding-color-hex">Brand color</label>
						<div class="color">
							<input
								class="color__swatch"
								type="color"
								aria-label="Pick brand color"
								value={primaryColor || COLOR_FALLBACK}
								oninput={(e) => (primaryColor = e.currentTarget.value)}
								disabled={savingBranding}
							/>
							<input
								id="branding-color-hex"
								class="form__input color__hex"
								class:form__input--error={brandingFieldErrors.primaryColor}
								type="text"
								autocapitalize="none"
								spellcheck="false"
								bind:value={primaryColor}
								disabled={savingBranding}
								placeholder="#2563eb"
							/>
						</div>
						{#if brandingFieldErrors.primaryColor}
							<p class="form__error">{brandingFieldErrors.primaryColor}</p>
						{:else}
							<p class="form__hint">A 6-digit hex color. Leave blank to use the default theme.</p>
						{/if}
					</div>

					<div class="form__actions">
						<button class="btn btn--brand" type="submit" disabled={savingBranding}>
							{#if savingBranding}
								<span class="btn__spinner" aria-hidden="true"></span>
								<span>Saving…</span>
							{:else}
								<i class="ri-check-line" aria-hidden="true"></i>
								<span>Save branding</span>
							{/if}
						</button>
					</div>
				</form>
			{/if}
		</section>
	{:else}
		<TemplatesTab />
	{/if}
</section>

<style lang="scss">
	.page {
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
			color: var(--text-body);
		}
	}

	.tabs {
		display: flex;
		gap: 4px;
		margin-bottom: 28px;
		border-bottom: 1px solid var(--border-default);
		overflow-x: auto;

		&__tab {
			display: inline-flex;
			align-items: center;
			gap: 8px;
			padding: 10px 14px;
			margin-bottom: -1px;
			font-family: inherit;
			font-size: 14px;
			font-weight: 500;
			white-space: nowrap;
			color: var(--text-body);
			background-color: transparent;
			border: none;
			border-bottom: 2px solid transparent;
			cursor: pointer;
			transition: color 200ms;

			i {
				font-size: 18px;
			}

			&:hover {
				color: var(--text-heading);
			}

			&:focus-visible {
				outline: none;
				box-shadow: 0 0 0 3px var(--brand-medium);
				border-radius: var(--radius-base);
			}

			&--active {
				color: var(--fg-brand);
				border-bottom-color: var(--brand);
			}
		}
	}

	.card {
		padding: 24px;
		background-color: var(--neutral-primary-soft);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-base);
		box-shadow: var(--shadow-xs);

		&--form {
			max-width: 560px;
		}

		&__head {
			margin-bottom: 20px;
		}

		&__title {
			margin: 0 0 4px;
			font-size: 16px;
			font-weight: 600;
			color: var(--text-heading);
		}

		&__desc {
			margin: 0;
			font-size: 13px;
			color: var(--text-body);
		}
	}

	.color {
		display: flex;
		align-items: center;
		gap: 12px;

		&__swatch {
			flex-shrink: 0;
			width: 44px;
			height: 40px;
			padding: 2px;
			background-color: var(--neutral-secondary-medium);
			border: 1px solid var(--border-default-medium);
			border-radius: var(--radius-base);
			cursor: pointer;

			&:disabled {
				cursor: not-allowed;
				opacity: 0.85;
			}
		}

		&__hex {
			flex: 1;
		}
	}

	.form {
		display: flex;
		flex-direction: column;
		gap: 16px;

		&__field {
			display: flex;
			flex-direction: column;
		}

		&__label {
			display: block;
			margin-bottom: 8px;
			font-size: 14px;
			font-weight: 500;
			color: var(--text-heading);
		}

		&__input {
			display: block;
			width: 100%;
			padding: 10px 12px;
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

			&--error {
				border-color: var(--border-danger);

				&:focus {
					border-color: var(--border-danger);
					box-shadow: 0 0 0 1px var(--danger);
				}
			}
		}

		&__hint {
			margin: 6px 0 0;
			font-size: 12px;
			color: var(--text-body-subtle);
		}

		&__error {
			margin: 6px 0 0;
			font-size: 12px;
			color: var(--fg-danger);
		}

		&__actions {
			display: flex;
			justify-content: flex-end;
		}

		&__alert {
			display: flex;
			align-items: center;
			gap: 8px;
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

		&__success {
			display: flex;
			align-items: center;
			gap: 8px;
			padding: 12px;
			font-size: 14px;
			color: var(--fg-success);
			background-color: var(--success-soft);
			border: 1px solid var(--border-success);
			border-radius: var(--radius-base);

			i {
				font-size: 16px;
			}
		}
	}

	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 10px 16px;
		font-family: inherit;
		font-size: 14px;
		font-weight: 500;
		border: 1px solid transparent;
		border-radius: var(--radius-base);
		cursor: pointer;
		transition: background-color 200ms;

		i {
			font-size: 16px;
		}

		&:disabled {
			cursor: not-allowed;
			opacity: 0.85;
		}

		&--sm {
			padding: 8px 12px;
		}

		&--brand {
			color: var(--text-white);
			background-color: var(--brand);
			box-shadow:
				var(--shadow-xs),
				inset var(--color-1-400) 0 6px 0px -5px,
				var(--color-1-700) 0 4px 10px -5px;

			&:hover:not(:disabled) {
				background-color: var(--brand-strong);
			}

			&:focus-visible {
				outline: none;
				box-shadow: 0 0 0 4px var(--brand-medium);
			}
		}

		&--secondary {
			color: var(--text-body);
			background-color: var(--neutral-secondary-medium);
			border-color: var(--border-default-medium);
			box-shadow:
				var(--shadow-xs),
				inset var(--color-1-400) 0 6px 0px -5px,
				var(--color-1-700) 0 4px 10px -5px;

			&:hover:not(:disabled) {
				color: var(--text-heading);
				background-color: var(--neutral-tertiary-medium);
			}

			&:focus-visible {
				outline: none;
				box-shadow: 0 0 0 4px var(--neutral-tertiary);
			}
		}

		&__spinner {
			width: 16px;
			height: 16px;
			border: 2px solid var(--color-1-400);
			border-top-color: currentColor;
			border-radius: var(--radius-full);
			animation: cj-spin 700ms linear infinite;
		}
	}
</style>
