<script lang="ts">
	import { onMount } from 'svelte';
	import { deriveSpecimenMark, parseTagList, type Take } from '$lib/domain';
	import PrimaryButton from './PrimaryButton.svelte';
	import GhostButton from './GhostButton.svelte';
	import SpecimenMark from './SpecimenMark.svelte';

	let {
		takes,
		busy = false,
		progressActive = false,
		progressLabel = '',
		progressFraction = null,
		progressCurrent = null,
		progressIndex,
		progressTotal,
		embedded = false,
		initialStem = '',
		initialDescription = '',
		initialTags = '',
		oncancel,
		onconfirm,
		onremove
	}: {
		takes: Take[];
		busy?: boolean;
		progressActive?: boolean;
		progressLabel?: string;
		progressFraction?: number | null;
		progressCurrent?: string | null;
		progressIndex: number;
		progressTotal: number;
		embedded?: boolean;
		initialStem?: string;
		initialDescription?: string;
		initialTags?: string;
		oncancel: () => void;
		onconfirm: (overlay: {
			titleStem: string;
			description: string;
			tags: string[];
		}) => void | Promise<void>;
		onremove?: (takeId: string) => void;
	} = $props();

	let titleStem = $state('');
	let description = $state('');
	let tagsText = $state('');

	onMount(() => {
		titleStem = initialStem;
		description = initialDescription;
		tagsText = initialTags;
	});

	const canConfirm = $derived(
		!busy && !progressActive && titleStem.trim().length > 0 && takes.length > 0
	);
	const hasRemove = $derived(onremove != null);

	async function handleConfirm(event: Event) {
		event.preventDefault();
		if (!canConfirm) return;

		await onconfirm({
			titleStem: titleStem.trim(),
			description: description.trim(),
			tags: parseTagList(tagsText)
		});
	}

	function handleRemove(takeId: string) {
		onremove?.(takeId);
	}
</script>

<form class={['batch-upload', embedded && 'embedded']} onsubmit={handleConfirm}>
	{#if progressActive}
		<!-- Progress phase -->
		<div class="progress-section" role="status" aria-live="polite">
			<h3 class="progress-title">
				Uploading {progressIndex} of {progressTotal}
			</h3>
			{#if progressCurrent}
				<p class="progress-current">{progressCurrent}</p>
			{/if}
			<p class="progress-status">{progressLabel}</p>

			{#if progressFraction != null && Number.isFinite(progressFraction)}
				<div class="progress-track" aria-hidden="true">
					<div class="progress-fill" style={`width: ${Math.round(progressFraction * 100)}%`}></div>
				</div>
			{:else}
				<div class="progress-track progress-track-indeterminate" aria-hidden="true">
					<div class="progress-fill-indeterminate"></div>
				</div>
			{/if}

			<GhostButton onclick={oncancel}>Cancel</GhostButton>
		</div>
	{:else}
		<!-- Confirm phase -->
		<header class="upload-header">
			<h3 class="upload-title">
				{takes.length} ready to upload
			</h3>
		</header>

		<div class="takes-preview">
			{#each takes as take (take.id)}
				<div class="take-preview-row">
					<SpecimenMark mark={deriveSpecimenMark(take)} size="compact" />
					<span class="take-name">{take.metadata.displayName}</span>
					{#if hasRemove}
						<GhostButton
							icon
							compact
							danger
							onclick={() => handleRemove(take.id)}
							aria-label="Remove from upload"
							title="Remove"
						>
							×
						</GhostButton>
					{/if}
				</div>
			{/each}
		</div>

		<div class="fields">
			<label class="field">
				<span class="field-label">Title stem</span>
				<input
					type="text"
					class="control"
					bind:value={titleStem}
					placeholder="Base name for numbered uploads"
					required
					disabled={busy}
				/>
			</label>

			<label class="field">
				<span class="field-label">Description</span>
				<textarea
					class="control textarea"
					bind:value={description}
					placeholder="Optional description for all uploads"
					rows="2"
					disabled={busy}></textarea>
			</label>

			<label class="field">
				<span class="field-label">Tags</span>
				<input
					type="text"
					class="control"
					bind:value={tagsText}
					placeholder="comma-separated"
					disabled={busy}
				/>
			</label>
		</div>

		<div class="actions">
			<GhostButton onclick={oncancel} disabled={busy}>Cancel</GhostButton>
			<PrimaryButton type="submit" disabled={!canConfirm}>
				{busy ? 'Uploading…' : 'Upload'}
			</PrimaryButton>
		</div>
	{/if}
</form>

<style>
	.batch-upload {
		display: grid;
		gap: var(--space-4);
		padding: var(--space-4);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-panel);
		background: var(--surface);
	}

	.batch-upload.embedded {
		padding: 0;
		border: none;
		border-radius: 0;
		background: transparent;
	}

	.progress-section {
		display: grid;
		gap: var(--space-3);
		text-align: center;
	}

	.progress-title {
		margin: 0;
		font-size: var(--text-body);
		font-weight: 600;
		color: var(--ink);
	}

	.progress-current {
		margin: 0;
		font-size: var(--text-meta);
		color: var(--ink-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.progress-status {
		margin: 0;
		font-size: var(--text-body);
		font-weight: 600;
		color: var(--ink);
	}

	.progress-track {
		height: 4px;
		background: var(--surface-subtle);
		border: 1px solid var(--line);
		border-radius: var(--radius-round);
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: var(--ink);
		transition: width 80ms linear;
	}

	.progress-track-indeterminate {
		position: relative;
	}

	.progress-fill-indeterminate {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 40%;
		background: var(--brand);
		border-radius: var(--radius-round);
		animation: progress-slide 1.1s ease-in-out infinite;
	}

	@keyframes progress-slide {
		0% {
			left: -40%;
		}
		100% {
			left: 100%;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.progress-fill {
			transition: none;
		}

		.progress-fill-indeterminate {
			animation: none;
		}
	}

	.upload-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}

	.upload-title {
		margin: 0;
		font-size: var(--text-body);
		font-weight: 600;
		color: var(--ink);
	}

	.takes-preview {
		display: grid;
		gap: var(--space-2);
		max-height: 12rem;
		overflow-y: auto;
		padding: var(--space-2);
		border: 1px solid var(--line);
		border-radius: var(--radius-control);
		background: var(--paper);
	}

	.take-preview-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: var(--space-6);
	}

	.take-name {
		flex: 1;
		min-width: 0;
		font-size: var(--text-meta);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.fields {
		display: grid;
		gap: var(--space-3);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.field-label {
		font-size: var(--text-label);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ink-muted);
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
		min-height: calc(var(--touch-min) * 1.5);
		resize: vertical;
		line-height: 1.4;
	}

	.actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}
</style>
