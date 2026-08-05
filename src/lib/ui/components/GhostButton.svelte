<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';

	type SharedProps = {
		/** When set, renders an `<a>` (callers pass base-aware href from `resolve(...)`). */
		href?: string;
		type?: 'button' | 'submit';
		disabled?: boolean;
		onclick?: (event: MouseEvent) => void;
		class?: string;
		/** Sticky on — flat face highlight (e.g. Field Notes open, Loop latched). */
		active?: boolean;
		/** Icon-only: square face (touch-min − space-2). */
		icon?: boolean;
		/** Taller capture chrome — matches CollectionShortcut well/face height. */
		chrome?: boolean;
		/** Compact waveform / toolbar hit size (~30px). */
		compact?: boolean;
		/** Destructive ghost — signal label/icon only. */
		danger?: boolean;
		/** Idle label/icon uses muted ink (nav chrome). */
		muted?: boolean;
		/** Brand status LED on the well (connected account, latched loop). */
		live?: boolean;
		children: Snippet;
	};

	let {
		href,
		type = 'button',
		disabled = false,
		onclick,
		class: className,
		active = false,
		icon = false,
		chrome = false,
		compact = false,
		danger = false,
		muted = false,
		live = false,
		children,
		...rest
	}: SharedProps &
		Omit<HTMLButtonAttributes, 'type' | 'disabled' | 'onclick' | 'class' | 'children' | 'href'> &
		Omit<HTMLAnchorAttributes, 'href' | 'onclick' | 'class' | 'children'> = $props();

	const rootClass = $derived([
		'ss-ghost-button',
		icon && 'icon',
		chrome && 'chrome',
		compact && 'compact',
		danger && 'danger',
		muted && 'muted',
		active && 'active',
		live && 'live-on',
		className
	]);
</script>

{#snippet face()}
	<span class="well">
		<span class="face">
			{@render children()}
		</span>
		{#if live}
			<span class="live" aria-hidden="true"></span>
		{/if}
	</span>
{/snippet}

{#if href}
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- href is pre-resolved by callers -->
	<a class={rootClass} {href} {onclick} {...rest}>
		{@render face()}
	</a>
{:else}
	<button class={rootClass} {type} {disabled} {onclick} {...rest}>
		{@render face()}
	</button>
{/if}

<style>
	.ss-ghost-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		min-width: var(--touch-min);
		min-height: var(--touch-min);
		padding: 0;
		border: none;
		/* Concentric with face + well padding so press fill reads as a grown face. */
		border-radius: calc(var(--radius-panel) + var(--space-1));
		background: transparent;
		color: var(--ink);
		font-family: var(--font-mono);
		font-size: var(--text-button);
		font-weight: 600;
		text-decoration: none;
		cursor: default;
	}

	.ss-ghost-button.muted:not(:disabled):not(.active) {
		color: var(--ink-muted);
	}

	.ss-ghost-button.danger {
		color: var(--signal);
	}

	.ss-ghost-button:focus-visible {
		outline: none;
	}

	.ss-ghost-button:focus-visible .well {
		outline: 2px solid var(--ink);
		outline-offset: var(--space-1);
	}

	.ss-ghost-button.danger:focus-visible .well {
		outline-color: var(--signal);
	}

	.well {
		position: relative;
		display: grid;
		place-items: center;
		min-height: var(--space-6);
		padding: var(--space-1);
		box-sizing: border-box;
		border-radius: calc(var(--radius-panel) + var(--space-1));
		background: transparent;
	}

	.compact {
		min-width: 30px;
		min-height: 30px;
		border-radius: var(--radius-control);
		font-size: var(--text-label);
		letter-spacing: 0.04em;
	}

	.compact .well {
		min-height: 0;
		padding: 0;
		border-radius: var(--radius-control);
	}

	.compact .face {
		min-height: 30px;
		padding: 0 var(--space-2);
		border-radius: var(--radius-control);
	}

	.compact.icon .well {
		width: 30px;
		height: 30px;
	}

	.compact.icon .face {
		width: 100%;
		height: 100%;
		min-height: 0;
		padding: 0;
	}

	.face {
		display: grid;
		place-items: center;
		min-height: calc(var(--touch-min) - var(--space-2));
		padding: 0 var(--space-3);
		box-sizing: border-box;
		border-radius: var(--radius-panel);
		background: transparent;
	}

	/* Square face at touch-min − well padding (space-1 × 2). */
	.icon .face {
		width: calc(var(--touch-min) - var(--space-2));
		height: calc(var(--touch-min) - var(--space-2));
		min-height: 0;
		padding: 0;
		overflow: hidden;
	}

	/* Capture record-row chrome — mirror CollectionShortcut well/face geometry. */
	.chrome {
		border-radius: calc(var(--radius-control) + var(--space-1));
	}

	.chrome .well {
		min-height: calc(var(--touch-min) + var(--space-2));
		border-radius: calc(var(--radius-control) + var(--space-1));
	}

	.chrome.icon .face {
		width: auto;
		height: auto;
		min-width: calc(var(--touch-min) + var(--space-2) - var(--space-1) * 2);
		min-height: calc(var(--touch-min) + var(--space-2) - var(--space-1) * 2);
		padding: 0 var(--space-2);
		border-radius: var(--radius-control);
		overflow: visible;
	}

	.live {
		position: absolute;
		top: var(--space-3);
		right: var(--space-3);
		width: var(--space-1);
		height: var(--space-1);
		border-radius: var(--radius-round);
		background: var(--brand);
		pointer-events: none;
	}

	@media (prefers-reduced-motion: no-preference) {
		.ss-ghost-button {
			transition: color 140ms ease;
		}

		.well,
		.face {
			transition: background-color 140ms ease;
		}

		.live-on .live {
			animation: ghost-live 2.4s ease-in-out infinite;
		}
	}

	@keyframes ghost-live {
		0%,
		100% {
			background-color: var(--brand);
		}
		50% {
			background-color: color-mix(in srgb, var(--brand) 55%, var(--ink));
		}
	}

	@media (hover: hover) {
		.ss-ghost-button:hover:not(:disabled) {
			color: var(--ink);
		}

		.ss-ghost-button.danger:hover:not(:disabled) {
			color: var(--signal);
		}

		.ss-ghost-button:hover:not(:disabled) .face {
			background: var(--surface);
		}
	}

	.ss-ghost-button.active:not(:disabled) {
		color: var(--ink);
	}

	.ss-ghost-button.active:not(:disabled) .face {
		background: var(--surface);
	}

	/* Press: flat surface fill grown to the well — outer radius already concentric. */
	.ss-ghost-button:active:not(:disabled) {
		background: var(--surface);
	}

	.ss-ghost-button:active:not(:disabled) .well {
		background: var(--surface);
	}

	.ss-ghost-button:active:not(:disabled) .face {
		background: var(--surface);
	}

	.ss-ghost-button:disabled {
		color: var(--disabled);
		cursor: not-allowed;
	}

	:global(.ss-ghost-button .avatar) {
		width: 100%;
		height: 100%;
		border-radius: var(--radius-panel);
		object-fit: cover;
		display: block;
	}
</style>
