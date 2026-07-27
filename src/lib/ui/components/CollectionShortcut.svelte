<script lang="ts">
	import { resolve } from '$app/paths';
	import { Icon } from '$lib/ui/icons';

	let {
		totalCount,
		pendingCount = 0,
		hidden = false,
		ariaLabel
	}: {
		totalCount: number;
		pendingCount?: number;
		hidden?: boolean;
		ariaLabel: string;
	} = $props();
</script>

<a
	class="collection-shortcut"
	class:slot-hidden={hidden}
	href={resolve('/drafts')}
	tabindex={hidden ? -1 : undefined}
	aria-hidden={hidden}
	aria-label={ariaLabel}
	title="Collection"
>
	<span class="well">
		<span class="face">
			<Icon name="collection" />
			<span class="counts">
				{#if pendingCount > 0}
					<span class="pending-bubble" aria-hidden="true"
						>{String(pendingCount).padStart(2, '0')}</span
					>
				{/if}
				<span class="total">{String(totalCount).padStart(2, '0')}</span>
			</span>
		</span>
	</span>
</a>

<style>
	.collection-shortcut {
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
		text-decoration: none;
		font-size: var(--text-meta);
		font-weight: 600;
		cursor: pointer;
	}

	.collection-shortcut:focus-visible {
		outline: none;
	}

	.collection-shortcut:focus-visible .well {
		outline: 2px solid var(--ink);
		outline-offset: var(--space-1);
	}

	.well {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: calc(var(--touch-min) + var(--space-2));
		padding: var(--space-1);
		box-sizing: border-box;
		border-radius: calc(var(--radius-control) + var(--space-1));
		background: transparent;
	}

	.face {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: calc(var(--touch-min) + var(--space-2) - var(--space-1) * 2);
		padding: 0 var(--space-2);
		box-sizing: border-box;
		border-radius: var(--radius-control);
		background: transparent;
	}

	.counts {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: calc(var(--space-1) / 2);
		min-width: calc(var(--text-meta) * 1.5);
		font-variant-numeric: tabular-nums;
		letter-spacing: 0.02em;
	}

	.pending-bubble {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: calc(var(--space-4) + var(--space-1));
		min-height: var(--space-4);
		padding: 0 var(--space-1);
		border-radius: var(--radius-round);
		background: var(--signal);
		color: var(--paper);
		font-size: var(--text-label);
		font-weight: 700;
		line-height: 1;
	}

	.total {
		color: var(--ink);
		font-size: var(--text-meta);
		font-weight: 600;
		line-height: 1;
	}

	.slot-hidden {
		visibility: hidden;
		pointer-events: none;
	}

	@media (prefers-reduced-motion: no-preference) {
		.collection-shortcut {
			transition: color 140ms ease;
		}

		.well,
		.face {
			transition: background-color 140ms ease;
		}
	}

	@media (hover: hover) {
		.collection-shortcut:hover {
			color: var(--ink);
		}

		.collection-shortcut:hover .well {
			background: var(--surface-subtle);
		}

		.collection-shortcut:hover .face {
			background: var(--surface);
		}
	}

	.collection-shortcut:active {
		background: var(--surface);
	}

	.collection-shortcut:active .well {
		background: var(--surface);
	}

	.collection-shortcut:active .face {
		background: var(--surface);
	}
</style>
