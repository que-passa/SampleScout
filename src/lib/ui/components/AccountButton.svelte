<script lang="ts">
	import { openAccountOverlay } from '$lib/state/account-overlay';
	import { audiotoolAuth } from '$lib/state/audiotool-auth.svelte';

	let { expanded }: { expanded?: boolean } = $props();

	const avatarUrl = $derived(audiotoolAuth.status.avatarUrl);
	const navAvatarSrc = $derived(
		avatarUrl ? avatarUrl.replace('300x300.webp', '60x60.webp') : undefined
	);

	let failedSrc = $state<string | undefined>(undefined);

	const showAvatar = $derived(Boolean(navAvatarSrc) && navAvatarSrc !== failedSrc);
</script>

<button
	type="button"
	class="account-button"
	onclick={openAccountOverlay}
	aria-label="Account"
	aria-haspopup="dialog"
	aria-expanded={expanded}
>
	<span class="well">
		<span class="face">
			{#if showAvatar}
				<img
					class="avatar"
					src={navAvatarSrc}
					alt=""
					width="28"
					height="28"
					onerror={() => {
						if (navAvatarSrc) failedSrc = navAvatarSrc;
					}}
				/>
			{:else}
				<svg
					class="account-icon"
					viewBox="0 0 24 24"
					width="20"
					height="20"
					aria-hidden="true"
					focusable="false"
					fill="currentColor"
				>
					<path
						d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
					/>
				</svg>
			{/if}
		</span>
	</span>
</button>

<style>
	.account-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		min-width: var(--touch-min);
		min-height: var(--touch-min);
		padding: 0;
		border: none;
		border-radius: var(--radius-round);
		background: transparent;
		color: var(--ink-muted);
		cursor: pointer;
	}

	.account-button:focus-visible {
		outline: none;
	}

	.account-button:focus-visible .well {
		outline: 2px solid var(--ink);
		outline-offset: var(--space-1);
	}

	.well {
		display: grid;
		place-items: center;
		width: var(--touch-min);
		height: var(--touch-min);
		flex-shrink: 0;
		padding: var(--space-1);
		box-sizing: border-box;
		border-radius: var(--radius-round);
		background: var(--surface-subtle);
		/* Soft recessed pad — inset only, no floating drop-shadow. */
		box-shadow:
			inset 0 var(--space-1) var(--space-2) color-mix(in srgb, var(--ink) 14%, transparent),
			inset 0 calc(var(--space-1) * -1) var(--space-1)
				color-mix(in srgb, var(--paper) 70%, transparent);
	}

	.face {
		display: grid;
		place-items: center;
		width: 100%;
		height: 100%;
		overflow: hidden;
		border-radius: var(--radius-round);
		background: var(--surface);
		/* Quiet face depth. */
		box-shadow:
			inset 0 1px 0 color-mix(in srgb, var(--paper) 22%, transparent),
			inset 0 -1px 0 color-mix(in srgb, var(--ink) 18%, transparent);
	}

	@media (prefers-reduced-motion: no-preference) {
		.well {
			transition: box-shadow 140ms ease;
		}

		.face {
			transition:
				background-color 140ms ease,
				box-shadow 140ms ease,
				transform 140ms ease;
		}
	}

	@media (hover: hover) {
		.account-button:hover .well {
			box-shadow:
				inset 0 var(--space-1) var(--space-2) color-mix(in srgb, var(--ink) 10%, transparent),
				inset 0 calc(var(--space-1) * -1) var(--space-1)
					color-mix(in srgb, var(--paper) 78%, transparent);
		}

		.account-button:hover .face {
			background: color-mix(in srgb, var(--surface) 78%, var(--paper));
			transform: scale(1.02);
		}
	}

	.account-button:active .well {
		box-shadow:
			inset 0 var(--space-1) var(--space-2) color-mix(in srgb, var(--ink) 30%, transparent),
			inset 0 calc(var(--space-1) * -1) var(--space-1)
				color-mix(in srgb, var(--paper) 48%, transparent);
	}

	.account-button:active .face {
		background: color-mix(in srgb, var(--surface) 88%, var(--ink));
		transform: scale(0.95);
	}

	.account-icon {
		display: block;
	}

	.avatar {
		width: 100%;
		height: 100%;
		border-radius: var(--radius-round);
		object-fit: cover;
		display: block;
	}
</style>
