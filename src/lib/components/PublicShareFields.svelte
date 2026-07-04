<script lang="ts">
	import { page } from '$app/state';
	import { slugFormatValid } from '$lib/slug';

	// Public-sharing widget (toggle + slug + live availability + URL preview + copy),
	// shared by the New-project and Edit-project modals so the two stay identical.
	//
	// `slug` and `isPublic` are bindable so the parent owns the values it submits.
	// `projectId` picks the availability endpoint: an id (Edit) hits the id-scoped
	// check that excludes the project's own slug; null (Create) hits the id-less
	// check that tests this admin's slugs. `serverError` shows a slug error the
	// server returned on submit (e.g. a race-lost unique conflict).
	let {
		slug = $bindable(''),
		isPublic = $bindable(false),
		projectId = null,
		disabled = false,
		serverError = null
	}: {
		slug?: string;
		isPublic?: boolean;
		projectId?: string | null;
		disabled?: boolean;
		serverError?: string | null;
	} = $props();

	type SlugStatus = 'idle' | 'invalid' | 'checking' | 'available' | 'taken';
	let slugStatus = $state<SlugStatus>('idle');
	let slugCheckTimer: ReturnType<typeof setTimeout> | null = null;
	let copied = $state(false);

	// The admin's login username namespaces every public link: /p/<username>/<slug>.
	const adminUsername = $derived(page.data.user?.username ?? '');
	const shareUrl = $derived(
		slug && adminUsername ? `${page.url.origin}/p/${adminUsername}/${slug}` : ''
	);

	const availabilityUrl = (target: string) =>
		projectId
			? `/api/projects/${projectId}/slug-available?slug=${encodeURIComponent(target)}`
			: `/api/projects/slug-available?slug=${encodeURIComponent(target)}`;

	// Normalise as the admin types, then debounce a live availability check.
	function onSlugInput(raw: string) {
		const s = raw.trim().toLowerCase();
		slug = s;
		copied = false;
		if (slugCheckTimer) clearTimeout(slugCheckTimer);

		if (s === '') {
			slugStatus = 'idle';
			return;
		}
		if (!slugFormatValid(s)) {
			slugStatus = 'invalid';
			return;
		}

		slugStatus = 'checking';
		slugCheckTimer = setTimeout(async () => {
			const target = s;
			try {
				const res = await fetch(availabilityUrl(target));
				const body = await res.json().catch(() => ({}));
				// Ignore stale responses if the admin kept typing.
				if (slug !== target) return;
				if (!res.ok) {
					slugStatus = 'idle';
					return;
				}
				slugStatus = body.valid && body.available ? 'available' : 'taken';
			} catch {
				if (slug === target) slugStatus = 'idle';
			}
		}, 400);
	}

	async function copyShareUrl() {
		if (!shareUrl) return;
		try {
			await navigator.clipboard.writeText(shareUrl);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			copied = false;
		}
	}
</script>

<!-- Public sharing: a login-less, read-only view of this journey. -->
<div class="share">
	<span class="share__title">Public sharing</span>
	<p class="share__lead">
		Share a read-only version of this journey with anyone — no login needed.
	</p>

	<label class="toggle">
		<input type="checkbox" class="toggle__input" bind:checked={isPublic} {disabled} />
		<span class="toggle__track" aria-hidden="true"><span class="toggle__thumb"></span></span>
		<span class="toggle__text">{isPublic ? 'Public view is on' : 'Public view is off'}</span>
	</label>

	<div class="share__field">
		<label class="share__label" for="public-share-slug">Public link</label>
		<div class="share__row">
			<span class="share__prefix">/p/{adminUsername}/</span>
			<input
				id="public-share-slug"
				class="share__input"
				class:share__input--error={serverError ||
					slugStatus === 'invalid' ||
					slugStatus === 'taken'}
				type="text"
				value={slug}
				oninput={(e) => onSlugInput(e.currentTarget.value)}
				{disabled}
				placeholder="acme-website"
				autocomplete="off"
				spellcheck="false"
			/>
		</div>

		{#if slugStatus === 'invalid'}
			<p class="share__error">Use 3–40 lowercase letters, numbers and hyphens.</p>
		{:else if slugStatus === 'checking'}
			<p class="share__status share__status--muted">
				<span class="share__spinner" aria-hidden="true"></span> Checking availability…
			</p>
		{:else if slugStatus === 'available'}
			<p class="share__status share__status--ok">
				<i class="ri-check-line" aria-hidden="true"></i> This link is available.
			</p>
		{:else if slugStatus === 'taken'}
			<p class="share__error">That link is already taken. Try another.</p>
		{/if}
		{#if serverError}
			<p class="share__error">{serverError}</p>
		{/if}

		{#if slug && slugStatus !== 'invalid'}
			<div class="share__preview">
				<span class="share__url" title={shareUrl}>{shareUrl}</span>
				<button type="button" class="share__copy" onclick={copyShareUrl} {disabled}>
					{#if copied}
						<i class="ri-check-line" aria-hidden="true"></i>
						<span>Copied</span>
					{:else}
						<i class="ri-file-copy-line" aria-hidden="true"></i>
						<span>Copy</span>
					{/if}
				</button>
			</div>
		{/if}
	</div>
</div>

<style lang="scss">
	.share {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding-top: 16px;
		border-top: 1px solid var(--border-default);

		&__title {
			display: block;
			font-size: 14px;
			font-weight: 500;
			color: var(--text-heading);
		}

		&__lead {
			margin: -4px 0 0;
			font-size: 13px;
			line-height: 1.5;
			color: var(--text-body-subtle);
		}

		&__field {
			display: flex;
			flex-direction: column;
			margin-top: 4px;
		}

		&__label {
			display: block;
			margin-bottom: 8px;
			font-size: 14px;
			font-weight: 500;
			color: var(--text-heading);
		}

		&__row {
			display: flex;
			align-items: stretch;
		}

		&__prefix {
			display: inline-flex;
			align-items: center;
			padding: 0 10px;
			font-size: 14px;
			color: var(--text-body-subtle);
			background-color: var(--neutral-tertiary-medium);
			border: 1px solid var(--border-default-medium);
			border-right: none;
			border-radius: var(--radius-base) 0 0 var(--radius-base);
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
			border-radius: 0 var(--radius-base) var(--radius-base) 0;
			box-shadow: var(--shadow-xs);
			transition: all 200ms;

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

		&__error {
			margin: 6px 0 0;
			font-size: 12px;
			color: var(--fg-danger);
		}

		&__status {
			display: inline-flex;
			align-items: center;
			gap: 6px;
			margin: 6px 0 0;
			font-size: 12px;

			i {
				font-size: 14px;
			}

			&--muted {
				color: var(--text-body-subtle);
			}

			&--ok {
				color: var(--fg-success);
			}
		}

		&__spinner {
			width: 12px;
			height: 12px;
			border: 2px solid var(--border-default-strong);
			border-top-color: var(--text-body);
			border-radius: var(--radius-full);
			animation: cj-spin 700ms linear infinite;
		}

		&__preview {
			display: flex;
			align-items: center;
			gap: 8px;
			margin-top: 10px;
			padding: 8px 8px 8px 12px;
			background-color: var(--neutral-secondary-medium);
			border: 1px solid var(--border-default);
			border-radius: var(--radius-base);
		}

		&__url {
			flex: 1;
			min-width: 0;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			font-size: 13px;
			color: var(--text-body);
		}

		&__copy {
			display: inline-flex;
			flex-shrink: 0;
			align-items: center;
			justify-content: center;
			gap: 8px;
			padding: 8px 12px;
			font-family: inherit;
			font-size: 14px;
			font-weight: 500;
			color: var(--text-body);
			background-color: var(--neutral-secondary-medium);
			border: 1px solid var(--border-default-medium);
			border-radius: var(--radius-base);
			box-shadow: var(--shadow-xs);
			cursor: pointer;
			transition: background-color 200ms;

			i {
				font-size: 16px;
			}

			&:hover:not(:disabled) {
				color: var(--text-heading);
				background-color: var(--neutral-tertiary-medium);
			}

			&:disabled {
				cursor: not-allowed;
				opacity: 0.85;
			}

			&:focus-visible {
				outline: none;
				box-shadow: 0 0 0 4px var(--neutral-tertiary);
			}
		}
	}

	// Accessible toggle switch: a native checkbox rendered as a switch.
	.toggle {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		cursor: pointer;
		user-select: none;

		&__input {
			position: absolute;
			width: 1px;
			height: 1px;
			opacity: 0;
			pointer-events: none;
		}

		&__track {
			position: relative;
			flex-shrink: 0;
			width: 40px;
			height: 22px;
			background-color: var(--neutral-tertiary-medium);
			border: 1px solid var(--border-default-medium);
			border-radius: var(--radius-full);
			transition: background-color 200ms;
		}

		&__thumb {
			position: absolute;
			top: 2px;
			left: 2px;
			width: 16px;
			height: 16px;
			background-color: var(--neutral-primary);
			border-radius: var(--radius-full);
			box-shadow: var(--shadow-xs);
			transition: transform 200ms;
		}

		&__input:checked + &__track {
			background-color: var(--brand);
			border-color: var(--brand);

			.toggle__thumb {
				transform: translateX(18px);
				background-color: var(--text-white);
			}
		}

		&__input:focus-visible + &__track {
			box-shadow: 0 0 0 3px var(--brand-medium);
		}

		&__input:disabled + &__track {
			opacity: 0.6;
		}

		&__text {
			font-size: 14px;
			color: var(--text-heading);
		}
	}
</style>
