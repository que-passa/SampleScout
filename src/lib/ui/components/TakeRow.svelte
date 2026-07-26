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

	let {
		name,
		durationSeconds,
		kind,
		savedLocally,
		catalogReference,
		specimenMark,
		uploadState,
		playing = false,
		takeId,
		expanded = false,
		editable = false,
		selectable = false,
		selected = false,
		retryBusy = false,
		onplay,
		onrename,
		ondiscard,
		onretry,
		ontoggle,
		onselect
	}: {
		name: string;
		durationSeconds: number;
		kind: string;
		savedLocally: boolean;
		catalogReference: string;
		specimenMark: SpecimenMarkValue;
		uploadState?: TakeUploadState | string;
		playing?: boolean;
		takeId?: string;
		expanded?: boolean;
		editable?: boolean;
		selectable?: boolean;
		selected?: boolean;
		retryBusy?: boolean;
		onplay?: () => void;
		onrename?: (name: string) => void | Promise<void>;
		ondiscard?: () => void;
		onretry?: () => void;
		ontoggle?: () => void;
		onselect?: (selected: boolean) => void;
	} = $props();

	let editing = $state(false);
	let draftName = $state('');
	let menuOpen = $state(false);

	function formatDuration(seconds: number): string {
		const clamped = Math.max(0, Math.floor(seconds));
		const mins = Math.floor(clamped / 60);
		const secs = clamped % 60;
		return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
	}

	const duration = $derived(formatDuration(durationSeconds));
	const takeHref = $derived(takeId ? (`/take/${takeId}` as `/take/${string}`) : undefined);
	const openable = $derived(Boolean(takeHref) && !editing);
	const hasMenu = $derived(Boolean(editable && onrename));

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
		if (savedLocally) return 'ok';
		return 'muted';
	}

	const statusText = $derived(getStatusText());
	const statusTone = $derived(getStatusTone());

	function autofocus(node: HTMLInputElement) {
		node.focus();
		node.select();
	}

	function startEdit() {
		if (!editable || !onrename) return;
		draftName = name;
		editing = true;
		menuOpen = false;
	}

	async function commitEdit() {
		if (!editing) return;
		editing = false;
		const next = draftName.trim() || name;
		draftName = next;
		if (next !== name && onrename) await onrename(next);
	}

	function cancelEdit() {
		draftName = name;
		editing = false;
	}

	function onNameKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			void commitEdit();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			cancelEdit();
		}
	}

	function toggleMenu() {
		menuOpen = !menuOpen;
		ontoggle?.();
	}
</script>

<div class="take-row" class:expanded class:openable class:selected>
	{#if openable && takeHref}
		<a class="row-link" href={resolve(takeHref)} aria-label="Open {name}"></a>
	{/if}

	{#if selectable}
		<button
			type="button"
			class="select-toggle"
			class:checked={selected}
			aria-pressed={selected}
			aria-label={selected ? `Deselect ${name}` : `Select ${name}`}
			onclick={(event) => {
				event.preventDefault();
				event.stopPropagation();
				onselect?.(!selected);
			}}
		>
			<span class="select-mark" aria-hidden="true">{selected ? '✓' : ''}</span>
		</button>
	{/if}

	<div class="catalog-identity">
		<SpecimenMark mark={specimenMark} />
	</div>

	<div class="main">
		{#if editing}
			<input
				{@attach autofocus}
				type="text"
				class="name-input"
				bind:value={draftName}
				onblur={() => void commitEdit()}
				onkeydown={onNameKeydown}
				aria-label="Take name"
			/>
		{:else}
			<span class="name">{name}</span>
		{/if}
		<div class="meta">
			<span class="catalog-reference">{catalogReference}</span>
			<span class="duration">{duration}</span>
			<span class="kind">{kind}</span>
			{#if statusText}
				<StatusLabel tone={statusTone}>{statusText}</StatusLabel>
			{/if}
		</div>
	</div>

	{#if onplay}
		<button
			type="button"
			class="icon-button"
			class:playing
			onclick={onplay}
			aria-label={playing ? 'Stop' : 'Play'}
		>
			<span class="glyph" aria-hidden="true"></span>
		</button>
	{/if}

	{#if onretry}
		<button
			type="button"
			class="retry-button"
			aria-label="Retry upload for {name}"
			title="Retry"
			disabled={retryBusy}
			onclick={(event) => {
				event.preventDefault();
				event.stopPropagation();
				menuOpen = false;
				onretry();
			}}
		>
			{retryBusy ? '…' : 'Retry'}
		</button>
	{/if}

	{#if ondiscard}
		<button
			type="button"
			class="discard-button"
			aria-label="Discard {name}"
			title="Discard"
			onclick={(event) => {
				event.preventDefault();
				event.stopPropagation();
				menuOpen = false;
				ondiscard();
			}}
		>
			<svg
				class="trash-icon"
				viewBox="0 0 24 24"
				width="20"
				height="20"
				aria-hidden="true"
				focusable="false"
			>
				<path
					fill="currentColor"
					d="M9 3h6v2h5v2H4V5h5V3zm-3 6h2v10H6V9zm4 0h2v10h-2V9zm4 0h2v10h-2V9zM5 21h14V8H5v13z"
				/>
			</svg>
		</button>
	{/if}

	{#if hasMenu}
		<div class="menu-wrap">
			<button
				type="button"
				class="icon-button menu-button"
				aria-label="Take actions"
				aria-expanded={menuOpen}
				onclick={toggleMenu}
			>
				⋯
			</button>
			{#if menuOpen}
				<div class="menu" role="menu">
					{#if editable && onrename}
						<button
							type="button"
							class="menu-item"
							role="menuitem"
							onclick={() => {
								menuOpen = false;
								startEdit();
							}}
						>
							Rename
						</button>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.take-row {
		position: relative;
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3);
		border: 1px solid var(--line);
		border-radius: var(--radius-panel);
		background: var(--surface);
		min-height: var(--touch-min);
	}

	.take-row.openable {
		cursor: pointer;
	}

	.take-row.openable:hover {
		border-color: var(--line-strong);
		background: var(--surface-subtle);
	}

	.take-row.expanded {
		border-color: var(--line-strong);
	}

	.take-row.selected {
		border-color: var(--line-strong);
		background: var(--surface-subtle);
	}

	.row-link {
		position: absolute;
		inset: 0;
		z-index: 0;
		border-radius: inherit;
	}

	.row-link:focus {
		outline: none;
	}

	.row-link:focus-visible {
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
		border: 1px solid var(--ink);
		border-radius: var(--radius-control);
		background: var(--surface);
		color: var(--ink);
		cursor: pointer;
		font-size: var(--text-body);
		font-weight: 700;
	}

	.select-toggle.checked {
		background: var(--ink);
		color: var(--surface);
	}

	.select-toggle:focus {
		outline: none;
	}

	.select-toggle:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}

	.select-mark {
		line-height: 1;
	}

	.main {
		position: relative;
		z-index: 0;
		flex: 1;
		display: grid;
		gap: var(--space-1);
		min-width: 0;
		pointer-events: none;
	}

	.catalog-identity {
		position: relative;
		z-index: 0;
		display: flex;
		flex: none;
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

	.name-input {
		pointer-events: auto;
		width: 100%;
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--ink);
		border-radius: var(--radius-control);
		background: var(--surface);
		font-size: var(--text-body);
		font-weight: 600;
	}

	.name {
		font-size: var(--text-body);
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		text-align: left;
	}

	.meta {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-2);
		font-size: var(--text-meta);
		color: var(--ink-muted);
	}

	.duration {
		font-family: var(--font-mono);
		font-weight: 600;
	}

	.kind {
		font-weight: 500;
	}

	.icon-button {
		position: relative;
		z-index: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		width: var(--touch-min);
		height: var(--touch-min);
		border: 1px solid var(--line);
		border-radius: var(--radius-control);
		background: var(--surface);
		cursor: pointer;
		flex-shrink: 0;
		font-size: var(--text-body);
		font-weight: 700;
		color: var(--ink);
	}

	.icon-button:hover {
		border-color: var(--line-strong);
	}

	.icon-button:focus {
		outline: none;
	}

	.icon-button:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}

	.retry-button {
		position: relative;
		z-index: 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		min-width: var(--touch-min);
		height: var(--touch-min);
		padding: 0 var(--space-3);
		border: 1px solid var(--ink);
		border-radius: var(--radius-control);
		background: var(--surface);
		color: var(--ink);
		cursor: pointer;
		font-size: var(--text-annotation);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.retry-button:hover:not(:disabled) {
		background: var(--surface-subtle);
	}

	.retry-button:disabled {
		opacity: 0.5;
		cursor: wait;
	}

	.retry-button:focus {
		outline: none;
	}

	.retry-button:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}

	.discard-button {
		position: relative;
		z-index: 1;
		display: inline-grid;
		place-items: center;
		flex-shrink: 0;
		width: var(--touch-min);
		height: var(--touch-min);
		padding: 0;
		border: 1px solid var(--signal);
		border-radius: var(--radius-control);
		background: var(--surface);
		color: var(--signal);
		cursor: pointer;
	}

	.discard-button:hover {
		background: var(--surface-subtle);
	}

	.discard-button:focus {
		outline: none;
	}

	.discard-button:focus-visible {
		outline: 2px solid var(--signal);
		outline-offset: 2px;
	}

	.trash-icon {
		display: block;
	}

	.glyph {
		width: 0;
		height: 0;
		border-style: solid;
		border-width: 6px 0 6px 10px;
		border-color: transparent transparent transparent currentColor;
	}

	.playing .glyph {
		width: 8px;
		height: 12px;
		border: none;
		background: linear-gradient(
			to right,
			currentColor 2px,
			transparent 2px,
			transparent 4px,
			currentColor 4px,
			currentColor 6px,
			transparent 6px
		);
	}

	.menu-wrap {
		position: relative;
		z-index: 1;
		flex-shrink: 0;
	}

	.menu {
		position: absolute;
		right: 0;
		top: calc(100% + var(--space-1));
		z-index: 5;
		min-width: 9rem;
		display: grid;
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-panel);
		background: var(--surface);
		overflow: hidden;
	}

	.menu-item {
		display: block;
		width: 100%;
		padding: var(--space-3);
		border: none;
		border-bottom: 1px solid var(--line);
		background: transparent;
		text-align: left;
		font-size: var(--text-annotation);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		text-decoration: none;
		color: var(--ink);
		cursor: pointer;
		min-height: var(--touch-min);
	}

	.menu-item:last-child {
		border-bottom: none;
	}

	.menu-item:hover {
		background: var(--surface-subtle);
	}

	.menu-item:focus {
		outline: none;
	}

	.menu-item:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: -2px;
	}
</style>
