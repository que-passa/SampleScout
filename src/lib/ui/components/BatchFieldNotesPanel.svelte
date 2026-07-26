<script lang="ts">
	import {
		parseTagList,
		type SampleKind,
		type TakeMetadataPatch,
		type Visibility
	} from '$lib/domain';

	let {
		selectedCount,
		busy = false,
		onapply,
		onclear
	}: {
		selectedCount: number;
		busy?: boolean;
		onapply: (patch: TakeMetadataPatch) => void | Promise<void>;
		onclear: () => void;
	} = $props();

	let applyDescription = $state(false);
	let description = $state('');
	let applyTags = $state(false);
	let tagsText = $state('');
	let applyKind = $state(false);
	let kind = $state<SampleKind>('one-shot');
	let applyVisibility = $state(false);
	let visibility = $state<Visibility>('unlisted');
	let applyBpm = $state(false);
	let bpmValue = $state<number | ''>('');

	const hasAnyApply = $derived(applyDescription || applyTags || applyKind || applyVisibility);

	const canApply = $derived(selectedCount > 0 && hasAnyApply && !busy);

	function buildPatch(): TakeMetadataPatch | null {
		const patch: TakeMetadataPatch = {};

		if (applyDescription) {
			patch.description = description;
		}
		if (applyTags) {
			patch.tags = parseTagList(tagsText);
		}
		if (applyKind) {
			patch.kind = kind;
			if (kind === 'one-shot') {
				patch.bpm = null;
			} else if (applyBpm) {
				const bpm = typeof bpmValue === 'number' && Number.isFinite(bpmValue) ? bpmValue : null;
				if (bpm == null || bpm <= 0) return null;
				patch.bpm = bpm;
			}
		}
		if (applyVisibility) {
			patch.visibility = visibility;
		}

		return Object.keys(patch).length > 0 ? patch : null;
	}

	async function onSubmit(event: Event) {
		event.preventDefault();
		if (!canApply) return;
		const patch = buildPatch();
		if (!patch) return;
		await onapply(patch);
	}
</script>

<form class="batch" onsubmit={onSubmit}>
	<header class="batch-header">
		<p class="batch-title">
			Batch Field Notes · {selectedCount} selected
		</p>
		<button type="button" class="clear" onclick={onclear} disabled={busy}>Clear</button>
	</header>

	<p class="hint">
		Only checked fields are applied. Manual values on each take are overwritten by this batch.
	</p>

	<label class="toggle-row">
		<input type="checkbox" bind:checked={applyDescription} disabled={busy} />
		<span class="toggle-label">Description</span>
	</label>
	{#if applyDescription}
		<textarea class="control textarea" bind:value={description} rows="2" disabled={busy}></textarea>
	{/if}

	<label class="toggle-row">
		<input type="checkbox" bind:checked={applyTags} disabled={busy} />
		<span class="toggle-label">Tags</span>
	</label>
	{#if applyTags}
		<input
			class="control"
			type="text"
			bind:value={tagsText}
			placeholder="comma-separated"
			disabled={busy}
		/>
	{/if}

	<label class="toggle-row">
		<input type="checkbox" bind:checked={applyKind} disabled={busy} />
		<span class="toggle-label">Kind</span>
	</label>
	{#if applyKind}
		<div class="segment" role="group" aria-label="Kind">
			<button
				type="button"
				class="segment-btn"
				class:selected={kind === 'one-shot'}
				aria-pressed={kind === 'one-shot'}
				disabled={busy}
				onclick={() => (kind = 'one-shot')}
			>
				one-shot
			</button>
			<button
				type="button"
				class="segment-btn"
				class:selected={kind === 'loop'}
				aria-pressed={kind === 'loop'}
				disabled={busy}
				onclick={() => (kind = 'loop')}
			>
				loop
			</button>
		</div>
		{#if kind === 'loop'}
			<label class="toggle-row nested">
				<input type="checkbox" bind:checked={applyBpm} disabled={busy} />
				<span class="toggle-label">BPM</span>
			</label>
			{#if applyBpm}
				<input
					class="control"
					type="number"
					inputmode="decimal"
					min="1"
					step="any"
					bind:value={bpmValue}
					disabled={busy}
				/>
			{/if}
		{/if}
	{/if}

	<label class="toggle-row">
		<input type="checkbox" bind:checked={applyVisibility} disabled={busy} />
		<span class="toggle-label">Visibility</span>
	</label>
	{#if applyVisibility}
		<div class="segment" role="group" aria-label="Visibility">
			<button
				type="button"
				class="segment-btn"
				class:selected={visibility === 'unlisted'}
				aria-pressed={visibility === 'unlisted'}
				disabled={busy}
				onclick={() => (visibility = 'unlisted')}
			>
				private
			</button>
			<button
				type="button"
				class="segment-btn"
				class:selected={visibility === 'public'}
				aria-pressed={visibility === 'public'}
				disabled={busy}
				onclick={() => (visibility = 'public')}
			>
				public
			</button>
		</div>
	{/if}

	<button type="submit" class="apply" disabled={!canApply}>
		{busy ? 'Applying…' : 'Apply to selected'}
	</button>
</form>

<style>
	.batch {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-4);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-panel);
		background: var(--surface);
	}

	.batch-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}

	.batch-title {
		margin: 0;
		font-size: var(--text-body);
		font-weight: 600;
	}

	.clear {
		min-height: var(--touch-min);
		padding: 0 var(--space-3);
		border: 1px solid var(--line);
		border-radius: var(--radius-control);
		background: var(--surface);
		color: var(--ink-muted);
		font-size: var(--text-annotation);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		cursor: pointer;
	}

	.hint {
		margin: 0;
		font-size: var(--text-meta);
		color: var(--ink-muted);
	}

	.toggle-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: var(--touch-min);
		cursor: pointer;
	}

	.toggle-row.nested {
		padding-left: var(--space-2);
	}

	.toggle-label {
		font-size: var(--text-label);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.control {
		box-sizing: border-box;
		width: 100%;
		min-height: var(--touch-min);
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--ink);
		border-radius: var(--radius-control);
		background: var(--surface);
		color: var(--ink);
		font-family: var(--font-mono);
		font-size: var(--text-body);
	}

	.textarea {
		min-height: calc(var(--touch-min) * 1.5);
		resize: vertical;
		line-height: 1.4;
	}

	.segment {
		display: flex;
		gap: var(--space-2);
	}

	.segment-btn {
		flex: 1;
		min-height: var(--touch-min);
		padding: 0 var(--space-3);
		border: 1px solid var(--ink);
		border-radius: var(--radius-control);
		background: var(--surface);
		color: var(--ink);
		font-family: var(--font-mono);
		font-size: var(--text-button);
		font-weight: 600;
		cursor: pointer;
	}

	.segment-btn.selected {
		background: var(--ink);
		color: var(--surface);
	}

	.apply {
		min-height: var(--touch-min);
		padding: 0 var(--space-4);
		border: 1px solid var(--ink);
		border-radius: var(--radius-control);
		background: var(--ink);
		color: var(--surface);
		font-size: var(--text-button);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		cursor: pointer;
	}

	.apply:disabled {
		border-color: var(--line);
		background: var(--line);
		cursor: not-allowed;
	}
</style>
