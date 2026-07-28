<script lang="ts">
	import { untrack } from 'svelte';
	import {
		generatedTagsForMetadata,
		tagsEqual,
		type SampleKind,
		type TakeId,
		type TakeMetadata,
		type TakeMetadataPatch,
		type Visibility
	} from '$lib/domain';
	import {
		isGeneratingTagsForTake,
		onGeneratedTagsStateChange
	} from '$lib/state/generated-tags';
	import GhostButton from '$lib/ui/components/GhostButton.svelte';
	import MetadataOriginPill from '$lib/ui/components/MetadataOriginPill.svelte';
	import TagInput from '$lib/ui/components/TagInput.svelte';

	let {
		metadata,
		takeId,
		recentTags = [],
		disabled = false,
		saving = false,
		formId = 'field-notes-form',
		canSave = $bindable(),
		onsave
	}: {
		metadata: TakeMetadata;
		/** When set, tag-generation queue state drives the tags origin pill spinner. */
		takeId?: TakeId;
		recentTags?: string[];
		disabled?: boolean;
		saving?: boolean;
		/** Form id for an external submit control (sheet footer). */
		formId?: string;
		/** Whether the draft differs from persisted metadata and may be saved. */
		canSave?: boolean;
		onsave: (patch: TakeMetadataPatch) => void | Promise<void>;
	} = $props();

	let tagsGenerating = $state(false);

	$effect(() => {
		const id = takeId;
		if (!id) {
			tagsGenerating = false;
			return;
		}

		const sync = () => {
			tagsGenerating = isGeneratingTagsForTake(id);
		};
		sync();
		return onGeneratedTagsStateChange(sync);
	});

	/** Recreate form draft only when persisted Field Notes identity changes. */
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
		tags = $state<string[]>([]);
		kind = $state<SampleKind>('one-shot');
		visibility = $state<Visibility>('unlisted');
		bpmValue = $state<number | ''>('');

		constructor(m: TakeMetadata) {
			this.description = m.description;
			this.tags = [...m.tags];
			this.kind = m.kind;
			this.visibility = m.visibility;
			this.bpmValue = m.bpm != null ? m.bpm : '';
		}
	}

	const draft = $derived.by(() => {
		void sourceKey;
		return untrack(() => new FieldNotesDraft(metadata));
	});

	function draftBpm(): number | undefined {
		const value = draft.bpmValue;
		return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
	}

	const isDirty = $derived.by(() => {
		if (draft.description !== metadata.description) return true;
		if (!tagsEqual(draft.tags, metadata.tags)) return true;
		if (draft.kind !== metadata.kind) return true;
		if (draft.visibility !== metadata.visibility) return true;
		if (draft.kind === 'loop') {
			return (draftBpm() ?? null) !== (metadata.bpm ?? null);
		}
		return metadata.bpm != null;
	});

	const saveEnabled = $derived(isDirty && !disabled && !saving);
	const canClearDescription = $derived(draft.description.length > 0 && !disabled);
	const canClearTags = $derived(draft.tags.length > 0 && !disabled);
	const generatedTags = $derived(generatedTagsForMetadata(metadata));

	$effect(() => {
		canSave = saveEnabled;
	});

	function clearDescription() {
		if (!canClearDescription) return;
		draft.description = '';
	}

	function clearTags() {
		if (!canClearTags) return;
		draft.tags = [];
	}

	function buildPatch(): TakeMetadataPatch {
		const patch: TakeMetadataPatch = {};

		if (draft.description !== metadata.description) {
			patch.description = draft.description;
		}

		const tags = [...draft.tags];
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
		if (!saveEnabled) return;
		const patch = buildPatch();
		if (Object.keys(patch).length === 0) return;
		await onsave(patch);
	}
</script>

<form id={formId} class="field-notes" onsubmit={onSubmit}>
	<div class="field">
		<div class="label-row">
			<div class="label-group">
				<label class="label" for="field-notes-description">Description</label>
				<MetadataOriginPill origin={metadata.provenance.description} />
			</div>
			<GhostButton compact muted disabled={!canClearDescription} onclick={clearDescription}>
				Clear
			</GhostButton>
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
			<div class="label-group">
				<label class="label" for="field-notes-tags">Tags</label>
				<MetadataOriginPill origin={metadata.provenance.tags} loading={tagsGenerating} />
			</div>
			<GhostButton compact muted disabled={!canClearTags} onclick={clearTags}>Clear</GhostButton>
		</div>
		<TagInput
			inputId="field-notes-tags"
			bind:tags={draft.tags}
			{recentTags}
			{disabled}
			{generatedTags}
		/>
	</div>

	<div class="field">
		<span class="label" id="field-notes-kind-label">Kind</span>
		<div class="segment" role="tablist" aria-labelledby="field-notes-kind-label">
			<button
				type="button"
				class="segment-btn"
				class:selected={draft.kind === 'one-shot'}
				role="tab"
				aria-selected={draft.kind === 'one-shot'}
				{disabled}
				onclick={() => (draft.kind = 'one-shot')}
			>
				one-shot
			</button>
			<button
				type="button"
				class="segment-btn"
				class:selected={draft.kind === 'loop'}
				role="tab"
				aria-selected={draft.kind === 'loop'}
				{disabled}
				onclick={() => (draft.kind = 'loop')}
			>
				loop
			</button>
		</div>
	</div>

	<div class="field">
		<span class="label" id="field-notes-visibility-label">Visibility</span>
		<div class="segment" role="tablist" aria-labelledby="field-notes-visibility-label">
			<button
				type="button"
				class="segment-btn"
				class:selected={draft.visibility === 'unlisted'}
				role="tab"
				aria-selected={draft.visibility === 'unlisted'}
				{disabled}
				onclick={() => (draft.visibility = 'unlisted')}
			>
				private
			</button>
			<button
				type="button"
				class="segment-btn"
				class:selected={draft.visibility === 'public'}
				role="tab"
				aria-selected={draft.visibility === 'public'}
				{disabled}
				onclick={() => (draft.visibility = 'public')}
			>
				public
			</button>
		</div>
	</div>

	{#if draft.kind === 'loop'}
		<div class="field">
			<div class="label-group">
				<label class="label" for="field-notes-bpm">BPM</label>
				<MetadataOriginPill origin={metadata.provenance.bpm} />
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
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		min-height: calc(var(--touch-min) - var(--space-4));
	}

	.label-group {
		display: inline-flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-2);
		min-width: 0;
	}

	.label {
		font-size: var(--text-label);
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink);
	}

	.control {
		box-sizing: border-box;
		width: 100%;
		min-height: var(--touch-min);
		padding: var(--space-2) var(--space-3);
		border: none;
		border-radius: var(--radius-control);
		background: var(--surface);
		color: var(--ink);
		font-family: var(--font-mono);
		font-size: var(--text-body);
		/* Raised card face — same language as Collection rows / active tabs. */
		box-shadow:
			0 1px var(--space-1) color-mix(in srgb, var(--ink) 6%, transparent),
			0 var(--space-1) var(--space-2) color-mix(in srgb, var(--ink) 8%, transparent),
			inset 0 1px 0 color-mix(in srgb, var(--surface) 80%, transparent),
			inset 0 -1px 0 color-mix(in srgb, var(--ink) 6%, transparent);
	}

	@media (prefers-reduced-motion: no-preference) {
		.control {
			transition: box-shadow 140ms ease;
		}
	}

	.control:focus {
		outline: none;
	}

	.control:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
		box-shadow:
			0 var(--space-1) var(--space-2) color-mix(in srgb, var(--ink) 8%, transparent),
			0 var(--space-2) var(--space-3) color-mix(in srgb, var(--ink) 10%, transparent),
			inset 0 1px 0 var(--surface),
			inset 0 -1px 0 color-mix(in srgb, var(--ink) 5%, transparent);
	}

	.control:disabled {
		background: var(--surface-subtle);
		color: var(--disabled);
		box-shadow:
			inset 0 var(--space-1) var(--space-1) color-mix(in srgb, var(--ink) 10%, transparent),
			inset 0 calc(var(--space-1) * -1) var(--space-1)
				color-mix(in srgb, var(--paper) 50%, transparent);
	}

	.textarea {
		min-height: calc(var(--touch-min) * 2);
		resize: vertical;
		line-height: 1.4;
	}

	.segment {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-1);
		padding: var(--space-1);
		border: none;
		border-radius: var(--radius-control);
		background: var(--surface-subtle);
		/* Recessed grouping well — same language as RecordControl. */
		box-shadow:
			inset 0 var(--space-1) var(--space-2) color-mix(in srgb, var(--ink) 14%, transparent),
			inset 0 calc(var(--space-1) * -1) var(--space-1)
				color-mix(in srgb, var(--paper) 70%, transparent);
	}

	.segment-btn {
		position: relative;
		z-index: 0;
		min-height: calc(var(--touch-min) - var(--space-2));
		padding: 0 var(--space-3);
		border: none;
		border-radius: calc(var(--radius-control) - 1px);
		background: transparent;
		color: var(--ink-muted);
		font-family: var(--font-mono);
		font-size: var(--text-button);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: lowercase;
		cursor: default;
		box-shadow: none;
	}

	@media (prefers-reduced-motion: no-preference) {
		.segment-btn {
			transition:
				color 140ms ease,
				background-color 140ms ease,
				box-shadow 140ms ease;
		}
	}

	.segment-btn.selected {
		z-index: 1;
		background: var(--surface);
		color: var(--ink);
		/* Raised card face — sits flush in the well so track padding stays even. */
		box-shadow:
			0 1px var(--space-1) color-mix(in srgb, var(--ink) 8%, transparent),
			inset 0 1px 0 color-mix(in srgb, var(--surface) 80%, transparent),
			inset 0 -1px 0 color-mix(in srgb, var(--ink) 8%, transparent);
	}

	.segment-btn:focus {
		outline: none;
	}

	.segment-btn:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 1px;
	}

	.segment-btn:disabled {
		color: var(--disabled);
		cursor: not-allowed;
	}

	.segment-btn.selected:disabled {
		background: var(--surface);
		color: var(--disabled);
		box-shadow: none;
	}
</style>
