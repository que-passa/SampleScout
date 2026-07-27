<script lang="ts">
	import { Icon } from '$lib/ui/icons';

	let {
		playing = false,
		disabled = false,
		onclick
	}: {
		playing?: boolean;
		disabled?: boolean;
		onclick?: () => void;
	} = $props();
</script>

<button
	type="button"
	class="playback"
	class:playing
	{disabled}
	aria-pressed={playing}
	aria-label={playing ? 'Pause' : 'Play'}
	aria-keyshortcuts="Space"
	title={playing ? 'Pause (Space)' : 'Play (Space)'}
	{onclick}
>
	<span class="well" aria-hidden="true">
		<span class="glyph">
			<span class="glyph-mark">
				<Icon name={playing ? 'pause' : 'play'} size={32} />
			</span>
		</span>
	</span>
</button>

<style>
	.playback {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		/* Smaller than RecordControl: well ~88px, icon-only (no label). */
		width: calc(var(--space-7) + var(--space-5) + var(--space-2) * 2);
		height: calc(var(--space-7) + var(--space-5) + var(--space-2) * 2);
		padding: 0;
		border: none;
		background: transparent;
		color: var(--ink);
		box-sizing: border-box;
		cursor: default;
	}

	.playback:disabled {
		color: var(--ink-muted);
		cursor: default;
	}

	.playback:focus-visible {
		outline: none;
	}

	.playback:focus-visible .well {
		outline: 2px solid var(--ink);
		outline-offset: var(--space-1);
	}

	.well {
		display: grid;
		place-items: center;
		width: calc(var(--space-7) + var(--space-5) + var(--space-2) * 2);
		height: calc(var(--space-7) + var(--space-5) + var(--space-2) * 2);
		flex-shrink: 0;
		padding: var(--space-2);
		box-sizing: border-box;
		/* Concentric with glyph: face radius + well padding. */
		border-radius: calc(var(--radius-record) - var(--space-1) + var(--space-2));
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
		border-radius: calc(var(--radius-record) - var(--space-1));
		background: var(--ink);
		/* Quiet face depth on the dark core. */
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
		.playback:not(:disabled):hover .well {
			box-shadow:
				inset 0 var(--space-1) var(--space-2) color-mix(in srgb, var(--ink) 10%, transparent),
				inset 0 calc(var(--space-1) * -1) var(--space-1)
					color-mix(in srgb, var(--paper) 78%, transparent);
		}

		.playback:not(:disabled):hover .glyph {
			background: color-mix(in srgb, var(--ink) 92%, var(--paper));
		}
	}

	.playback:not(:disabled):active .well {
		box-shadow:
			inset 0 var(--space-1) var(--space-2) color-mix(in srgb, var(--ink) 30%, transparent),
			inset 0 calc(var(--space-1) * -1) var(--space-1)
				color-mix(in srgb, var(--paper) 48%, transparent);
	}

	.playback:not(:disabled):active .glyph {
		background: color-mix(in srgb, var(--ink) 92%, var(--paper));
	}

	.playback:disabled .glyph {
		background: var(--disabled);
		box-shadow:
			inset 0 1px 0 color-mix(in srgb, var(--paper) 16%, transparent),
			inset 0 -1px 0 color-mix(in srgb, var(--ink) 12%, transparent);
	}

	.playback:disabled .glyph-mark {
		color: var(--paper);
	}

	.glyph-mark {
		display: grid;
		place-items: center;
		width: var(--space-6);
		height: var(--space-6);
		border-radius: var(--radius-control);
		background: transparent;
		color: var(--brand);
		overflow: visible;
	}
</style>
