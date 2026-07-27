<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	let {
		type = 'button',
		disabled = false,
		onclick,
		class: className,
		active = false,
		icon = false,
		compact = false,
		danger = false,
		muted = false,
		live = false,
		focusOnMount = false,
		children,
		...rest
	}: {
		type?: 'button' | 'submit';
		disabled?: boolean;
		onclick?: (event: MouseEvent) => void;
		class?: string;
		/** Sticky on — flat well highlight (e.g. Field Notes open, Loop latched). */
		active?: boolean;
		/** Icon-only: square face; otherwise padded text face. */
		icon?: boolean;
		/** Compact waveform / toolbar hit size (~30px). */
		compact?: boolean;
		/** Destructive ghost — signal label/icon only. */
		danger?: boolean;
		/** Idle label/icon uses muted ink (nav chrome). */
		muted?: boolean;
		/** Brand status LED on the well (connected account, latched loop). */
		live?: boolean;
		focusOnMount?: boolean;
		children: Snippet;
	} & Omit<HTMLButtonAttributes, 'type' | 'disabled' | 'onclick' | 'class' | 'children'> = $props();

	function focusAttach(node: HTMLButtonElement) {
		if (focusOnMount) node.focus();
	}
</script>

<button
	{type}
	{disabled}
	{onclick}
	class={[
		'ss-ghost-button',
		icon && 'icon',
		compact && 'compact',
		danger && 'danger',
		muted && 'muted',
		active && 'active',
		live && 'live-on',
		className
	]}
	{@attach focusAttach}
	{...rest}
>
	<span class="well">
		<span class="face">
			{@render children()}
		</span>
		{#if live}
			<span class="live" aria-hidden="true"></span>
		{/if}
	</span>
</button>

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
		border-radius: var(--radius-control);
		background: transparent;
		color: var(--ink);
		font-family: var(--font-mono);
		font-size: var(--text-button);
		font-weight: 600;
		cursor: pointer;
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

	.icon .well {
		width: var(--space-6);
		height: var(--space-6);
		min-height: 0;
	}

	.compact {
		min-width: 30px;
		min-height: 30px;
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

	.icon .face {
		width: 100%;
		height: 100%;
		min-height: 0;
		padding: 0;
		overflow: hidden;
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

		.ss-ghost-button:hover:not(:disabled) .well {
			background: var(--surface-subtle);
		}

		.ss-ghost-button:hover:not(:disabled) .face {
			background: var(--surface);
		}
	}

	.ss-ghost-button.active:not(:disabled) {
		color: var(--ink);
	}

	.ss-ghost-button.active:not(:disabled) .well {
		background: var(--surface-subtle);
	}

	.ss-ghost-button.active:not(:disabled) .face {
		background: var(--surface);
	}

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
