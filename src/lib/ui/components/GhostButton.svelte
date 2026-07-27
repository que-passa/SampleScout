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
		danger = false,
		focusOnMount = false,
		children,
		...rest
	}: {
		type?: 'button' | 'submit';
		disabled?: boolean;
		onclick?: (event: MouseEvent) => void;
		class?: string;
		/** Sticky on — show instrument well chrome without hover (e.g. Select Done). */
		active?: boolean;
		/** Icon-only: fixed Account-sized well; otherwise padded text face. */
		icon?: boolean;
		danger?: boolean;
		/** Focus the control when mounted (sheet close, etc.). */
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
	class={['ss-ghost-button', icon && 'icon', danger && 'danger', active && 'active', className]}
	{@attach focusAttach}
	{...rest}
>
	<span class="well">
		<span class="face">
			{@render children()}
		</span>
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
		display: grid;
		place-items: center;
		min-height: var(--space-6);
		padding: var(--space-1);
		box-sizing: border-box;
		border-radius: calc(var(--radius-panel) + var(--space-1));
		background: transparent;
		box-shadow: none;
	}

	.icon .well {
		width: var(--space-6);
		height: var(--space-6);
		min-height: 0;
	}

	.face {
		display: grid;
		place-items: center;
		min-height: calc(var(--touch-min) - var(--space-2));
		padding: 0 var(--space-4);
		box-sizing: border-box;
		border-radius: var(--radius-panel);
		background: transparent;
		box-shadow: none;
	}

	.icon .face {
		width: 100%;
		height: 100%;
		min-height: 0;
		padding: 0;
		overflow: hidden;
	}

	@media (prefers-reduced-motion: no-preference) {
		.ss-ghost-button {
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
	}

	/* Flat well + face on hover — recessed chrome is sticky on / press only. */
	@media (hover: hover) {
		.ss-ghost-button:hover:not(:disabled) .well {
			background: var(--surface-subtle);
		}

		.ss-ghost-button:hover:not(:disabled) .face {
			background: var(--surface);
		}
	}

	/* Sticky on: Account / Collection recessed well + surface face. */
	.ss-ghost-button.active:not(:disabled) .well {
		background: var(--surface-subtle);
		box-shadow:
			inset 0 var(--space-1) var(--space-2) color-mix(in srgb, var(--ink) 14%, transparent),
			inset 0 calc(var(--space-1) * -1) var(--space-1)
				color-mix(in srgb, var(--paper) 70%, transparent);
	}

	.ss-ghost-button.active:not(:disabled) .face {
		background: var(--surface);
		box-shadow:
			inset 0 1px 0 color-mix(in srgb, var(--paper) 22%, transparent),
			inset 0 -1px 0 color-mix(in srgb, var(--ink) 18%, transparent);
	}

	.ss-ghost-button:active:not(:disabled) {
		color: var(--brand);
	}

	.ss-ghost-button.danger:active:not(:disabled) {
		color: var(--signal);
	}

	.ss-ghost-button:active:not(:disabled) .well {
		background: var(--surface-subtle);
		box-shadow:
			inset 0 var(--space-1) var(--space-2) color-mix(in srgb, var(--ink) 30%, transparent),
			inset 0 calc(var(--space-1) * -1) var(--space-1)
				color-mix(in srgb, var(--paper) 48%, transparent);
	}

	.ss-ghost-button:active:not(:disabled) .face {
		background: color-mix(in srgb, var(--surface) 88%, var(--ink));
		box-shadow:
			inset 0 1px 0 color-mix(in srgb, var(--paper) 22%, transparent),
			inset 0 -1px 0 color-mix(in srgb, var(--ink) 18%, transparent);
	}

	.ss-ghost-button:disabled {
		color: var(--disabled);
		cursor: not-allowed;
	}
</style>
