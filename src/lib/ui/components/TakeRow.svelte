<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		formatUploadStateLabel,
		uploadStateTone,
		type SpecimenMark as SpecimenMarkValue,
		type TakeUploadState
	} from '$lib/domain';
	import SpecimenMark from './SpecimenMark.svelte';
	import StatusLabel from './StatusLabel.svelte';
	import GhostButton from './GhostButton.svelte';
	import { Icon } from '$lib/ui/icons';

	let {
		name,
		savedLocally,
		catalogReference,
		specimenMark,
		uploadState,
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
		specimenMark: SpecimenMarkValue;
		uploadState?: TakeUploadState | string;
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

	const takeHref = $derived(takeId ? (`/take/${takeId}` as `/take/${string}`) : undefined);
	const openable = $derived(Boolean(takeHref));
	const hasActions = $derived(Boolean(onplay || onretry || ondiscard));

	function getStatusText(): string {
		if (uploadState && uploadState !== 'not-queued') {
			return formatUploadStateLabel(uploadState as TakeUploadState);
		}
		if (savedLocally) return 'LOCAL DRAFT';
		return '';
	}

	function getStatusTone(): 'neutral' | 'ok' | 'signal' | 'muted' {
		if (uploadState && uploadState !== 'not-queued') {
			return uploadStateTone(uploadState as TakeUploadState);
		}
		if (savedLocally) return 'signal';
		return 'muted';
	}

	const statusText = $derived(getStatusText());
	const statusTone = $derived(getStatusTone());
	const showTrailing = $derived(Boolean(statusText || hasActions));
</script>

<div
	class="take-row"
	class:expanded
	class:openable={openable && !selectable}
	class:selectable
	class:selected
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
		</div>
		<span class="catalog-reference">{catalogReference}</span>
	</div>

	{#if showTrailing}
		<div class="actions">
			{#if statusText}
				<span class="status-slot">
					<StatusLabel tone={statusTone} density="compact">{statusText}</StatusLabel>
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
		/* Brighter card face on paper — pure surface, lighter depth so it stays clean. */
		background: var(--surface);
		/* Subtle raised card — quiet face depth + soft lift (not a hard outline). */
		box-shadow:
			0 1px var(--space-1) color-mix(in srgb, var(--ink) 6%, transparent),
			0 var(--space-1) var(--space-3) color-mix(in srgb, var(--ink) 8%, transparent),
			inset 0 1px 0 color-mix(in srgb, var(--surface) 70%, transparent),
			inset 0 -1px 0 color-mix(in srgb, var(--ink) 6%, transparent);
		min-height: var(--touch-min);
	}

	.take-row.openable,
	.take-row.selectable {
		cursor: pointer;
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
		cursor: pointer;
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
		gap: var(--space-2);
		min-width: 0;
	}

	.name {
		flex: 1;
		min-width: 0;
		font-size: var(--text-body);
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		text-align: left;
	}

	.status-slot {
		display: inline-flex;
		align-items: center;
		flex-shrink: 0;
		margin-inline-end: var(--space-2);
		pointer-events: none;
	}

	.catalog-reference {
		max-width: 100%;
		overflow: hidden;
		color: var(--ink-muted);
		font-size: var(--text-annotation);
		font-weight: 600;
		letter-spacing: 0.04em;
		line-height: 1;
		text-overflow: ellipsis;
		white-space: nowrap;
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
