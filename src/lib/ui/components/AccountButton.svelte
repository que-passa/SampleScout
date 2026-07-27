<script lang="ts">
	import { openAccountOverlay } from '$lib/state/account-overlay';
	import { audiotoolAuth } from '$lib/state/audiotool-auth.svelte';
	import { Icon } from '$lib/ui/icons';

	let { expanded }: { expanded?: boolean } = $props();

	const connected = $derived(audiotoolAuth.status.state === 'connected');
	const avatarUrl = $derived(audiotoolAuth.status.avatarUrl);
	const navAvatarSrc = $derived(
		avatarUrl ? avatarUrl.replace('300x300.webp', '60x60.webp') : undefined
	);

	let failedSrc = $state<string | undefined>(undefined);

	const showAvatar = $derived(Boolean(navAvatarSrc) && navAvatarSrc !== failedSrc);
	const label = $derived(connected ? 'Account, connected' : 'Account');
</script>

<button
	type="button"
	class={['account-button', connected && 'connected']}
	onclick={openAccountOverlay}
	aria-label={label}
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
					width="24"
					height="24"
					onerror={() => {
						if (navAvatarSrc) failedSrc = navAvatarSrc;
					}}
				/>
			{:else}
				<Icon name="account" size={16} />
			{/if}
		</span>
		{#if connected}
			<span class="live" aria-hidden="true"></span>
		{/if}
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
		border-radius: var(--radius-control);
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
		position: relative;
		display: grid;
		place-items: center;
		width: var(--space-6);
		height: var(--space-6);
		flex-shrink: 0;
		padding: var(--space-1);
		box-sizing: border-box;
		border-radius: calc(var(--radius-panel) + var(--space-1));
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
		border-radius: var(--radius-panel);
		background: var(--surface);
		/* Quiet face depth. */
		box-shadow:
			inset 0 1px 0 color-mix(in srgb, var(--paper) 22%, transparent),
			inset 0 -1px 0 color-mix(in srgb, var(--ink) 18%, transparent);
	}

	.live {
		position: absolute;
		top: var(--space-2);
		right: var(--space-2);
		width: var(--space-1);
		height: var(--space-1);
		border-radius: var(--radius-round);
		background: var(--brand);
		pointer-events: none;
	}

	@media (prefers-reduced-motion: no-preference) {
		.account-button {
			transition: color 140ms ease;
		}

		.well {
			transition:
				background-color 140ms ease,
				box-shadow 140ms ease;
		}

		.face {
			transition:
				background-color 140ms ease,
				box-shadow 140ms ease;
		}

		.connected .live {
			/* Quiet instrument LED — solid fill, color only. */
			animation: account-live 2.4s ease-in-out infinite;
		}
	}

	@keyframes account-live {
		0%,
		100% {
			background-color: var(--brand);
		}
		50% {
			background-color: color-mix(in srgb, var(--brand) 55%, var(--ink));
		}
	}

	@media (hover: hover) {
		.account-button:hover {
			color: var(--ink);
		}

		.account-button:hover .well {
			background: color-mix(in srgb, var(--surface-subtle) 82%, var(--ink));
			box-shadow:
				inset 0 var(--space-1) var(--space-2) color-mix(in srgb, var(--ink) 6%, transparent),
				inset 0 calc(var(--space-1) * -1) var(--space-1)
					color-mix(in srgb, var(--paper) 90%, transparent);
		}

		.account-button:hover .face {
			background: color-mix(in srgb, var(--surface) 42%, var(--paper));
			box-shadow:
				inset 0 1px 0 color-mix(in srgb, var(--paper) 55%, transparent),
				inset 0 -1px 0 color-mix(in srgb, var(--ink) 10%, transparent);
		}
	}

	.account-button:active {
		color: var(--brand);
	}

	.account-button:active .well {
		box-shadow:
			inset 0 var(--space-1) var(--space-2) color-mix(in srgb, var(--ink) 30%, transparent),
			inset 0 calc(var(--space-1) * -1) var(--space-1)
				color-mix(in srgb, var(--paper) 48%, transparent);
	}

	.account-button:active .face {
		background: color-mix(in srgb, var(--surface) 88%, var(--ink));
	}

	.avatar {
		width: 100%;
		height: 100%;
		border-radius: var(--radius-panel);
		object-fit: cover;
		display: block;
	}
</style>
