<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		type CollectionLineageGlyph,
		type SpecimenMark as SpecimenMarkValue,
		type TakeUploadState,
		collectionLineageGlyphLabel
	} from '$lib/domain';
	import SpecimenMark from './SpecimenMark.svelte';
	import UploadStatusChip from './UploadStatusChip.svelte';
	import GhostButton from './GhostButton.svelte';
	import { Icon } from '$lib/ui/icons';

	let {
		name,
		savedLocally,
		catalogReference,
		recordedAtLabel = '',
		durationLabel = '',
		lineageGlyph = null,
		specimenMark,
		uploadState,
		errorMessage = '',
		playing = false,
		takeId,
		expanded = false,
		selectable = false,
		selected = false,
		retryBusy = false,
		onplay,
		ondiscard,
		onretry,
		onselect
	}: {
		name: string;
		savedLocally: boolean;
		catalogReference: string;
		/** Short date/time next to the catalog reference (e.g. `27/07/17:41`). */
		recordedAtLabel?: string;
		/** Recipe length, e.g. `18.2s`. */
		durationLabel?: string;
		/** Flat lineage cue: SRC when this take is the original with collected children. */
		lineageGlyph?: CollectionLineageGlyph | null;
		specimenMark: SpecimenMarkValue;
		uploadState?: TakeUploadState | string;
		/** Persisted upload failure text (wraps fully for mobile screenshots). */
		errorMessage?: string;
		playing?: boolean;
		takeId?: string;
		expanded?: boolean;
		selectable?: boolean;
		selected?: boolean;
		retryBusy?: boolean;
		onplay?: () => void;
		ondiscard?: () => void;
		onretry?: () => void;
		onselect?: (selected: boolean) => void;
	} = $props();

	const showError = $derived(Boolean(errorMessage?.trim()));
	const lineageTitle = $derived(
		lineageGlyph ? collectionLineageGlyphLabel(lineageGlyph) : undefined
	);

	const takeHref = $derived(takeId ? (`/take/${takeId}` as `/take/${string}`) : undefined);
	const openable = $derived(Boolean(takeHref));
	const hasActions = $derived(Boolean(onplay || onretry || ondiscard));
	const showStatusChip = $derived(
		savedLocally || Boolean(uploadState && uploadState !== 'not-queued')
	);
	const showTrailing = $derived(showStatusChip || hasActions);
</script>

<div
	class="take-row"
	class:expanded
	class:openable={openable && !selectable}
	class:selectable
	class:selected
	class:has-error={showError}
>
	{#if openable && takeHref && !selectable}
		<a class="row-link" href={resolve(takeHref)} aria-label="Open {name}"></a>
	{/if}

	{#if selectable}
		<button
			type="button"
			class="row-select"
			aria-pressed={selected}
			aria-label={selected ? `Deselect ${name}` : `Select ${name}`}
			onclick={() => onselect?.(!selected)}
		></button>
	{/if}

	{#if selectable}
		<span class="select-toggle" class:checked={selected} aria-hidden="true">
			<span class="select-mark">
				{#if selected}
					<Icon name="check" size={12} />
				{/if}
			</span>
		</span>
	{/if}

	<div class="catalog-identity">
		<SpecimenMark mark={specimenMark} />
	</div>

	<div class="main">
		<div class="title-row">
			<span class="name">{name}</span>
			{#if lineageGlyph}
				<span class="lineage-glyph" title={lineageTitle} aria-label={lineageTitle}
					>{lineageGlyph}</span
				>
			{/if}
		</div>
		<div class="meta-row">
			<span class="catalog-reference">{catalogReference}</span>
			{#if recordedAtLabel}
				<span class="recorded-at">{recordedAtLabel}</span>
			{/if}
			{#if durationLabel}
				<span class="duration">{durationLabel}</span>
			{/if}
		</div>
		{#if showError}
			<p class="error-message">{errorMessage.trim()}</p>
		{/if}
	</div>

	{#if showTrailing}
		<div class="actions">
			{#if showStatusChip}
				<span class="status-slot">
					<UploadStatusChip {uploadState} {savedLocally} />
				</span>
			{/if}

			{#if onplay}
				<GhostButton icon aria-label={playing ? 'Pause' : 'Play'} onclick={onplay}>
					<Icon name={playing ? 'pause' : 'play'} />
				</GhostButton>
			{/if}

			{#if onretry}
				<GhostButton
					compact
					disabled={retryBusy}
					aria-label="Retry upload for {name}"
					title="Retry"
					onclick={(event) => {
						event.preventDefault();
						event.stopPropagation();
						onretry();
					}}
				>
					{retryBusy ? '…' : 'Retry'}
				</GhostButton>
			{/if}

			{#if ondiscard}
				<GhostButton
					icon
					danger
					aria-label="Discard {name}"
					title="Discard"
					onclick={(event) => {
						event.preventDefault();
						event.stopPropagation();
						ondiscard();
					}}
				>
					<Icon name="trash" />
				</GhostButton>
			{/if}
		</div>
	{/if}
</div>

<style>
	.take-row {
		position: relative;
		z-index: 0;
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-2) var(--space-1) var(--space-1);
		border: none;
		border-radius: var(--radius-panel);
		background: var(--surface);
		/* Raised card — tighter lift so rows read against paper without a soft fog. */
		box-shadow:
			0 1px 0 color-mix(in srgb, var(--ink) 10%, transparent),
			0 1px var(--space-1) color-mix(in srgb, var(--ink) 12%, transparent),
			inset 0 1px 0 color-mix(in srgb, var(--surface) 70%, transparent),
			inset 0 -1px 0 color-mix(in srgb, var(--ink) 8%, transparent);
		min-height: var(--touch-min);
	}

	.take-row.has-error {
		align-items: flex-start;
	}

	.take-row.has-error .actions {
		padding-top: var(--space-1);
	}

	.take-row.openable,
	.take-row.selectable {
		cursor: default;
	}

	@media (prefers-reduced-motion: no-preference) {
		.take-row {
			transition:
				background-color 140ms ease,
				box-shadow 140ms ease,
				transform 140ms ease;
		}
	}

	@media (hover: hover) {
		.take-row.openable:hover,
		.take-row.selectable:hover {
			background: var(--surface);
			box-shadow:
				0 var(--space-1) var(--space-2) color-mix(in srgb, var(--ink) 8%, transparent),
				0 var(--space-2) var(--space-4) color-mix(in srgb, var(--ink) 10%, transparent),
				inset 0 1px 0 var(--surface),
				inset 0 -1px 0 color-mix(in srgb, var(--ink) 5%, transparent);
		}
	}

	@media (hover: hover) and (prefers-reduced-motion: no-preference) {
		.take-row.openable:hover,
		.take-row.selectable:hover {
			transform: translateY(-1px);
		}
	}

	.take-row.expanded,
	.take-row.selected {
		background: var(--surface);
		box-shadow:
			0 1px var(--space-1) color-mix(in srgb, var(--ink) 8%, transparent),
			0 var(--space-1) var(--space-2) color-mix(in srgb, var(--ink) 11%, transparent),
			inset 0 1px 0 var(--surface),
			inset 0 -1px 0 color-mix(in srgb, var(--ink) 8%, transparent);
		transform: none;
	}

	.row-link,
	.row-select {
		position: absolute;
		inset: 0;
		z-index: 0;
		border-radius: inherit;
	}

	.row-select {
		padding: 0;
		border: none;
		background: transparent;
		cursor: default;
	}

	.row-link:focus,
	.row-select:focus {
		outline: none;
	}

	.row-link:focus-visible,
	.row-select:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}

	.select-toggle {
		position: relative;
		z-index: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		width: var(--touch-min);
		height: var(--touch-min);
		flex-shrink: 0;
		pointer-events: none;
		color: var(--ink);
	}

	.select-mark {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		box-sizing: border-box;
		width: var(--space-4);
		height: var(--space-4);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-control);
		background: transparent;
		color: var(--surface);
		line-height: 1;
	}

	.select-toggle.checked .select-mark {
		border-color: var(--ink);
		background: var(--ink);
	}

	.catalog-identity {
		position: relative;
		z-index: 0;
		display: flex;
		align-items: center;
		flex: none;
		pointer-events: none;
	}

	.main {
		position: relative;
		z-index: 0;
		flex: 1;
		align-self: flex-start;
		display: grid;
		gap: var(--space-1);
		min-width: 0;
		padding-top: var(--space-1);
		pointer-events: none;
	}

	.title-row {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		min-width: 0;
	}

	.name {
		flex: 0 1 auto;
		min-width: 0;
		font-size: var(--text-body);
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		text-align: left;
	}

	.lineage-glyph {
		flex-shrink: 0;
		padding: 0 var(--space-1);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-control);
		color: var(--ink-muted);
		font-size: var(--text-micro);
		font-weight: 700;
		letter-spacing: 0.06em;
		line-height: 1.4;
		text-transform: uppercase;
	}

	.status-slot {
		display: inline-flex;
		align-items: center;
		flex-shrink: 0;
		margin-inline-end: var(--space-2);
		pointer-events: none;
	}

	.meta-row {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
		min-width: 0;
		max-width: 100%;
		color: var(--ink-muted);
		font-size: var(--text-annotation);
		font-weight: 600;
		letter-spacing: 0.04em;
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}

	.catalog-reference {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.duration,
	.recorded-at {
		flex-shrink: 0;
		white-space: nowrap;
	}

	.error-message {
		margin: 0;
		color: var(--signal);
		font-size: var(--text-annotation);
		font-weight: 500;
		letter-spacing: 0.02em;
		line-height: 1.35;
		white-space: normal;
		overflow-wrap: anywhere;
		word-break: break-word;
	}

	.actions {
		position: relative;
		z-index: 1;
		display: flex;
		align-items: center;
		flex-shrink: 0;
		gap: var(--space-1);
	}
</style>
