<script lang="ts">
	import { untrack } from 'svelte';
	import {
		formatMetadataOrigin,
		formatTagList,
		parseTagList,
		type SampleKind,
		type TakeMetadata,
		type TakeMetadataPatch,
		type Visibility
	} from '$lib/domain';

	let {
		metadata,
		disabled = false,
		saving = false,
		onsave
	}: {
		metadata: TakeMetadata;
		disabled?: boolean;
		saving?: boolean;
		onsave: (patch: TakeMetadataPatch) => void | Promise<void>;
	} = $props();

	/** Recreate local draft only when persisted Field Notes identity changes. */
	const sourceKey = $derived(
		[
			metadata.displayName,
			metadata.description,
			metadata.tags.join('\u0001'),
			metadata.kind,
			metadata.visibility,
			metadata.bpm ?? ''
		].join('\u0000')
	);

	class FieldNotesDraft {
		description = $state('');
		tagsText = $state('');
		kind = $state<SampleKind>('one-shot');
		visibility = $state<Visibility>('unlisted');
		bpmValue = $state<number | ''>('');

		constructor(m: TakeMetadata) {
			this.description = m.description;
			this.tagsText = formatTagList(m.tags);
			this.kind = m.kind;
			this.visibility = m.visibility;
			this.bpmValue = m.bpm != null ? m.bpm : '';
		}
	}

	const draft = $derived.by(() => {
		void sourceKey;
		return untrack(() => new FieldNotesDraft(metadata));
	});

	function tagsEqual(a: string[], b: string[]): boolean {
		if (a.length !== b.length) return false;
		return a.every((tag, index) => tag === b[index]);
	}

	function draftBpm(): number | undefined {
		const value = draft.bpmValue;
		return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
	}

	const isDirty = $derived.by(() => {
		if (draft.description !== metadata.description) return true;
		if (!tagsEqual(parseTagList(draft.tagsText), metadata.tags)) return true;
		if (draft.kind !== metadata.kind) return true;
		if (draft.visibility !== metadata.visibility) return true;
		if (draft.kind === 'loop') {
			return (draftBpm() ?? null) !== (metadata.bpm ?? null);
		}
		return metadata.bpm != null;
	});

	const canSave = $derived(isDirty && !disabled && !saving);

	function buildPatch(): TakeMetadataPatch {
		const patch: TakeMetadataPatch = {};

		if (draft.description !== metadata.description) {
			patch.description = draft.description;
		}

		const tags = parseTagList(draft.tagsText);
		if (!tagsEqual(tags, metadata.tags)) {
			patch.tags = tags;
		}

		if (draft.kind !== metadata.kind) {
			patch.kind = draft.kind;
		}

		if (draft.visibility !== metadata.visibility) {
			patch.visibility = draft.visibility;
		}

		if (draft.kind === 'loop') {
			const bpm = draftBpm();
			if (bpm !== undefined && bpm !== metadata.bpm) {
				patch.bpm = bpm;
			} else if (bpm === undefined && metadata.bpm != null) {
				patch.bpm = null;
			}
		} else if (metadata.bpm != null) {
			patch.bpm = null;
		}

		return patch;
	}

	async function onSubmit(event: Event) {
		event.preventDefault();
		if (!canSave) return;
		const patch = buildPatch();
		if (Object.keys(patch).length === 0) return;
		await onsave(patch);
	}
</script>

<form class="field-notes" onsubmit={onSubmit}>
	<div class="field">
		<div class="label-row">
			<label class="label" for="field-notes-description">Description</label>
			<span class="origin">{formatMetadataOrigin(metadata.provenance.description)}</span>
		</div>
		<textarea
			id="field-notes-description"
			class="control textarea"
			bind:value={draft.description}
			rows="3"
			{disabled}></textarea>
	</div>

	<div class="field">
		<div class="label-row">
			<label class="label" for="field-notes-tags">Tags</label>
			<span class="origin">{formatMetadataOrigin(metadata.provenance.tags)}</span>
		</div>
		<input
			id="field-notes-tags"
			class="control"
			type="text"
			bind:value={draft.tagsText}
			placeholder="comma-separated"
			autocomplete="off"
			{disabled}
		/>
	</div>

	<div class="field">
		<div class="label-row">
			<span class="label" id="field-notes-kind-label">Kind</span>
			<span class="origin">{formatMetadataOrigin(metadata.provenance.kind)}</span>
		</div>
		<div class="segment" role="group" aria-labelledby="field-notes-kind-label">
			<button
				type="button"
				class="segment-btn"
				class:selected={draft.kind === 'one-shot'}
				aria-pressed={draft.kind === 'one-shot'}
				{disabled}
				onclick={() => (draft.kind = 'one-shot')}
			>
				one-shot
			</button>
			<button
				type="button"
				class="segment-btn"
				class:selected={draft.kind === 'loop'}
				aria-pressed={draft.kind === 'loop'}
				{disabled}
				onclick={() => (draft.kind = 'loop')}
			>
				loop
			</button>
		</div>
	</div>

	<div class="field">
		<div class="label-row">
			<span class="label" id="field-notes-visibility-label">Visibility</span>
			<span class="origin">{formatMetadataOrigin(metadata.provenance.visibility)}</span>
		</div>
		<div class="segment" role="group" aria-labelledby="field-notes-visibility-label">
			<button
				type="button"
				class="segment-btn"
				class:selected={draft.visibility === 'unlisted'}
				aria-pressed={draft.visibility === 'unlisted'}
				{disabled}
				onclick={() => (draft.visibility = 'unlisted')}
			>
				private
			</button>
			<button
				type="button"
				class="segment-btn"
				class:selected={draft.visibility === 'public'}
				aria-pressed={draft.visibility === 'public'}
				{disabled}
				onclick={() => (draft.visibility = 'public')}
			>
				public
			</button>
		</div>
	</div>

	{#if draft.kind === 'loop'}
		<div class="field">
			<div class="label-row">
				<label class="label" for="field-notes-bpm">BPM</label>
				<span class="origin">{formatMetadataOrigin(metadata.provenance.bpm)}</span>
			</div>
			<input
				id="field-notes-bpm"
				class="control"
				type="number"
				inputmode="decimal"
				min="1"
				step="any"
				bind:value={draft.bpmValue}
				{disabled}
			/>
		</div>
	{/if}

	<div class="actions">
		<button type="submit" class="save" disabled={!canSave}>
			{saving ? 'Saving…' : 'Save'}
		</button>
		{#if saving}
			<span class="status" aria-live="polite">Saving…</span>
		{/if}
	</div>
</form>

<style>
	.field-notes {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		font-family: var(--font-mono);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.label-row {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-2);
	}

	.label {
		font-size: var(--text-label);
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink);
	}

	.origin {
		font-size: var(--text-meta);
		color: var(--ink-muted);
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

	.control:disabled {
		border-color: var(--line);
		color: var(--disabled);
	}

	.textarea {
		min-height: calc(var(--touch-min) * 2);
		resize: vertical;
		line-height: 1.4;
	}

	.segment {
		display: flex;
		flex-direction: row;
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
		letter-spacing: 0.04em;
		text-transform: lowercase;
		cursor: pointer;
	}

	.segment-btn.selected {
		background: var(--ink);
		color: var(--surface);
	}

	.segment-btn:disabled {
		border-color: var(--line);
		color: var(--disabled);
		cursor: not-allowed;
	}

	.segment-btn.selected:disabled {
		background: var(--line-strong);
		color: var(--surface);
		border-color: var(--line-strong);
	}

	.actions {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin-top: var(--space-1);
	}

	.save {
		min-height: var(--touch-min);
		padding: 0 var(--space-4);
		border: 1px solid var(--ink);
		border-radius: var(--radius-control);
		background: var(--ink);
		color: var(--surface);
		font-family: var(--font-mono);
		font-size: var(--text-button);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		cursor: pointer;
	}

	.save:disabled {
		border-color: var(--line);
		background: var(--line);
		color: var(--surface);
		cursor: not-allowed;
	}

	.status {
		font-size: var(--text-meta);
		color: var(--ink-muted);
	}
</style>
