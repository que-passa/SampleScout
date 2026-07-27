<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		type = 'button',
		disabled = false,
		onclick,
		class: className,
		children
	}: {
		type?: 'button' | 'submit';
		disabled?: boolean;
		onclick?: (event: MouseEvent) => void;
		class?: string;
		children: Snippet;
	} = $props();
</script>

<button {type} {disabled} {onclick} class={['ss-primary-button', className]}>
	<span class="well">
		<span class="face">
			{@render children()}
		</span>
	</span>
</button>

<style>
	.ss-primary-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		min-height: var(--touch-min);
		min-width: var(--touch-min);
		padding: 0;
		border: none;
		border-radius: var(--radius-control);
		background: transparent;
		color: var(--ink);
		font-family: var(--font-mono);
		font-size: var(--text-button);
		font-weight: 600;
		letter-spacing: 0.04em;
		cursor: pointer;
	}

	.ss-primary-button:focus-visible {
		outline: none;
	}

	.ss-primary-button:focus-visible .well {
		outline: 2px solid var(--ink);
		outline-offset: var(--space-1);
	}

	.well {
		display: grid;
		place-items: center;
		min-height: var(--space-6);
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
		min-height: calc(var(--touch-min) - var(--space-2));
		padding: 0 var(--space-3);
		box-sizing: border-box;
		border-radius: var(--radius-panel);
		/* Brighter than pure --brand; hover lifts further toward --brand-soft. */
		background: color-mix(in srgb, var(--brand) 62%, var(--brand-soft));
		color: var(--ink);
		/* Quiet face depth on the brand core. */
		box-shadow:
			inset 0 1px 0 color-mix(in srgb, var(--paper) 28%, transparent),
			inset 0 -1px 0 color-mix(in srgb, var(--ink) 14%, transparent);
	}

	@media (prefers-reduced-motion: no-preference) {
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

	@media (hover: hover) {
		.ss-primary-button:hover:not(:disabled) .well {
			background: color-mix(in srgb, var(--surface-subtle) 82%, var(--ink));
			box-shadow:
				inset 0 var(--space-1) var(--space-2) color-mix(in srgb, var(--ink) 6%, transparent),
				inset 0 calc(var(--space-1) * -1) var(--space-1)
					color-mix(in srgb, var(--paper) 90%, transparent);
		}

		.ss-primary-button:hover:not(:disabled) .face {
			background: color-mix(in srgb, var(--brand) 28%, var(--brand-soft));
			box-shadow:
				inset 0 1px 0 color-mix(in srgb, var(--paper) 55%, transparent),
				inset 0 -1px 0 color-mix(in srgb, var(--ink) 10%, transparent);
		}
	}

	.ss-primary-button:active:not(:disabled) .well {
		box-shadow:
			inset 0 var(--space-1) var(--space-2) color-mix(in srgb, var(--ink) 30%, transparent),
			inset 0 calc(var(--space-1) * -1) var(--space-1)
				color-mix(in srgb, var(--paper) 48%, transparent);
	}

	.ss-primary-button:active:not(:disabled) .face {
		background: color-mix(in srgb, var(--brand) 78%, var(--ink));
	}

	.ss-primary-button:disabled {
		cursor: not-allowed;
		color: var(--ink-muted);
	}

	.ss-primary-button:disabled .face {
		background: var(--disabled);
		color: var(--ink-muted);
		box-shadow:
			inset 0 1px 0 color-mix(in srgb, var(--paper) 16%, transparent),
			inset 0 -1px 0 color-mix(in srgb, var(--ink) 12%, transparent);
	}
</style>
