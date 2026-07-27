<script lang="ts">
	import { Icon } from '$lib/ui/icons';

	let {
		disabled = true,
		recording = false,
		onclick
	}: {
		disabled?: boolean;
		recording?: boolean;
		onclick?: () => void;
	} = $props();
</script>

<button
	type="button"
	class="record"
	class:recording
	{disabled}
	aria-pressed={recording}
	aria-label={recording ? 'Stop recording' : 'Start recording'}
	{onclick}
>
	<span class="well" aria-hidden="true">
		<span class="glyph">
			{#if recording}
				<span class="glyph-mark">
					<Icon name="stop" size={48} />
				</span>
			{:else}
				<span class="glyph-mark"></span>
			{/if}
		</span>
	</span>
	<span class="label">{recording ? 'Stop' : 'Record'}</span>
</button>

<style>
	.record {
		display: inline-flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		/* Fixed footprint: well (~120px) + label; bezel-aware so layout stays stable. */
		width: calc(var(--space-7) * 2 + var(--space-3) * 2);
		padding: 0;
		border: none;
		background: transparent;
		color: var(--ink);
		font-size: var(--text-label);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		box-sizing: border-box;
		cursor: pointer;
	}

	.record:disabled {
		color: var(--ink-muted);
		cursor: default;
	}

	.record:focus-visible {
		outline: none;
	}

	.record:focus-visible .well {
		outline: 2px solid var(--ink);
		outline-offset: var(--space-1);
	}

	.well {
		display: grid;
		place-items: center;
		width: calc(var(--space-7) * 2 + var(--space-3) * 2);
		height: calc(var(--space-7) * 2 + var(--space-3) * 2);
		flex-shrink: 0;
		padding: var(--space-3);
		box-sizing: border-box;
		/* Concentric with glyph: face radius + well padding. */
		border-radius: calc(var(--radius-record) + var(--space-3));
		background: var(--surface-subtle);
		/* Soft recessed pad — inset only, no floating drop-shadow. */
		box-shadow:
			inset 0 var(--space-1) var(--space-2) color-mix(in srgb, var(--ink) 14%, transparent),
			inset 0 calc(var(--space-1) * -1) var(--space-1)
				color-mix(in srgb, var(--paper) 70%, transparent);
	}

	.glyph {
		display: grid;
		place-items: center;
		width: 100%;
		height: 100%;
		border-radius: var(--radius-record);
		background: var(--signal);
		/* Quiet face depth on the red core. */
		box-shadow:
			inset 0 1px 0 color-mix(in srgb, var(--paper) 22%, transparent),
			inset 0 -1px 0 color-mix(in srgb, var(--ink) 18%, transparent);
	}

	.recording .glyph {
		background: var(--ink);
		/* Quiet face depth on the dark stop core. */
		box-shadow:
			inset 0 1px 0 color-mix(in srgb, var(--paper) 18%, transparent),
			inset 0 -1px 0 color-mix(in srgb, var(--ink) 40%, transparent);
	}

	@media (prefers-reduced-motion: no-preference) {
		.well {
			transition: box-shadow 140ms ease;
		}

		.glyph {
			transition:
				background-color 140ms ease,
				box-shadow 140ms ease;
		}

		.glyph-mark {
			transition: color 140ms ease;
		}
	}

	@media (hover: hover) {
		.record:not(:disabled):hover .well {
			box-shadow:
				inset 0 var(--space-1) var(--space-2) color-mix(in srgb, var(--ink) 10%, transparent),
				inset 0 calc(var(--space-1) * -1) var(--space-1)
					color-mix(in srgb, var(--paper) 78%, transparent);
		}

		.record:not(:disabled):not(.recording):hover .glyph {
			background: color-mix(in srgb, var(--signal) 90%, var(--paper));
		}

		.record.recording:not(:disabled):hover .glyph {
			background: color-mix(in srgb, var(--ink) 92%, var(--paper));
		}

		.record.recording:not(:disabled):hover .glyph-mark {
			color: color-mix(in srgb, var(--signal) 90%, var(--paper));
		}
	}

	.record:not(:disabled):active .well {
		box-shadow:
			inset 0 var(--space-1) var(--space-2) color-mix(in srgb, var(--ink) 30%, transparent),
			inset 0 calc(var(--space-1) * -1) var(--space-1)
				color-mix(in srgb, var(--paper) 48%, transparent);
	}

	.record:not(:disabled):not(.recording):active .glyph {
		background: color-mix(in srgb, var(--signal) 72%, var(--ink));
	}

	.record.recording:not(:disabled):active .glyph {
		background: color-mix(in srgb, var(--ink) 92%, var(--paper));
	}

	.record.recording:not(:disabled):active .glyph-mark {
		color: color-mix(in srgb, var(--signal) 72%, var(--ink));
	}

	.record:disabled .glyph {
		background: var(--disabled);
		box-shadow:
			inset 0 1px 0 color-mix(in srgb, var(--paper) 16%, transparent),
			inset 0 -1px 0 color-mix(in srgb, var(--ink) 12%, transparent);
	}

	.glyph-mark {
		display: grid;
		place-items: center;
		width: 0;
		height: 0;
		border-radius: var(--radius-control);
		background: transparent;
		color: var(--signal);
		overflow: hidden;
	}

	.recording .glyph-mark {
		width: var(--space-7);
		height: var(--space-7);
		background: transparent;
		color: var(--signal);
		overflow: visible;
	}

	.label {
		min-width: 4.5em;
		text-align: center;
		line-height: 1.2;
	}
</style>
