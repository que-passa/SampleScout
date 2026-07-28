<script lang="ts">
	import { onMount } from 'svelte';
	import { deriveSpecimenMark, type Take } from '$lib/domain';
	import {
		DEFAULT_UPLOAD_OUTPUT,
		outputToValue,
		UPLOAD_OUTPUT_OPTIONS,
		valueToOutput,
		type UploadOutput,
		type UploadOutputValue
	} from '$lib/config/upload-output';

	import { Icon } from '$lib/ui/icons';
	import PrimaryButton from './PrimaryButton.svelte';
	import GhostButton from './GhostButton.svelte';
	import SpecimenMark from './SpecimenMark.svelte';
	import TagInput from './TagInput.svelte';

	let {
		takes,
		busy = false,
		progressActive = false,
		progressLabel = '',
		progressFraction = null,
		progressCurrent = null,
		progressIndex,
		progressTotal,
		failureMessages = [],
		embedded = false,
		initialStem = '',
		initialDescription = '',
		initialTags = [],
		initialOutput = DEFAULT_UPLOAD_OUTPUT,
		recentTags = [],
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
		/** Failed upload messages to show during/after progress (full text for screenshots). */
		failureMessages?: { takeId?: string; name: string; message: string }[];
		embedded?: boolean;
		initialStem?: string;
		initialDescription?: string;
		initialTags?: string[];
		initialOutput?: UploadOutput;
		recentTags?: string[];
		oncancel: () => void;
		onconfirm: (overlay: {
			titleStem: string;
			description: string;
			tags: string[];
			output: UploadOutput;
		}) => void | Promise<void>;
		onremove?: (takeId: string) => void;
	} = $props();

	let titleStem = $state('');
	let description = $state('');
	let tags = $state<string[]>([]);
	let outputValue = $state<UploadOutputValue>('mp3-192');

	onMount(() => {
		titleStem = initialStem;
		description = initialDescription;
		tags = [...initialTags];
		outputValue = outputToValue(initialOutput);
	});

	const canConfirm = $derived(
		!busy && !progressActive && titleStem.trim().length > 0 && takes.length > 0
	);
	const hasRemove = $derived(onremove != null);
	const hasFailures = $derived(failureMessages.length > 0);
	const selectedOutputHint = $derived(
		UPLOAD_OUTPUT_OPTIONS.find((option) => option.value === outputValue)?.hint ?? ''
	);

	async function handleConfirm(event: Event) {
		event.preventDefault();
		if (!canConfirm) return;

		await onconfirm({
			titleStem: titleStem.trim(),
			description: description.trim(),
			tags: [...tags],
			output: valueToOutput(outputValue)
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
				{hasFailures && !progressCurrent
					? 'Upload results'
					: `Uploading ${progressIndex} of ${progressTotal}`}
			</h3>
			{#if progressCurrent}
				<p class="progress-current">{progressCurrent}</p>
			{/if}
			<p class="progress-status">{progressLabel}</p>

			{#if hasFailures}
				<ul class="failure-list">
					{#each failureMessages as failure (failure.takeId ?? failure.name + failure.message)}
						<li class="failure-item">
							<span class="failure-name">{failure.name}</span>
							<p class="failure-message">{failure.message}</p>
						</li>
					{/each}
				</ul>
			{/if}

			{#if !(hasFailures && !progressCurrent)}
				{#if progressFraction != null && Number.isFinite(progressFraction)}
					<div class="progress-track" aria-hidden="true">
						<div
							class="progress-fill"
							style={`width: ${Math.round(progressFraction * 100)}%`}
						></div>
					</div>
				{:else}
					<div class="progress-track progress-track-indeterminate" aria-hidden="true">
						<div class="progress-fill-indeterminate"></div>
					</div>
				{/if}
			{/if}

			<GhostButton onclick={oncancel}
				>{hasFailures && !progressCurrent ? 'Close' : 'Cancel'}</GhostButton
			>
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
							class="take-remove-button"
							danger
							onclick={() => handleRemove(take.id)}
							aria-label="Remove from upload"
							title="Remove"
						>
							<Icon name="minus" size={20} />
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
					placeholder="Base name"
					required
					disabled={busy}
				/>
			</label>

			<label class="field">
				<span class="field-label">Description</span>
				<textarea
					class="control textarea"
					bind:value={description}
					placeholder="Optional"
					rows="2"
					disabled={busy}></textarea>
			</label>

			<div class="field">
				<span class="field-label">Tags</span>
				<TagInput bind:tags {recentTags} disabled={busy} />
			</div>

			<label class="field">
				<span class="field-label">Upload quality</span>
				<select class="control select-control" bind:value={outputValue} disabled={busy}>
					{#each UPLOAD_OUTPUT_OPTIONS as option (option.value)}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
				<p class="field-hint">{selectedOutputHint}</p>
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

	.failure-list {
		display: grid;
		gap: var(--space-2);
		margin: 0;
		padding: var(--space-2);
		list-style: none;
		text-align: left;
		border: 1px solid var(--line);
		border-radius: var(--radius-control);
		background: var(--paper);
		max-height: 12rem;
		overflow-y: auto;
	}

	.failure-item {
		display: grid;
		gap: var(--space-1);
		min-width: 0;
	}

	.failure-name {
		font-size: var(--text-label);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}

	.failure-message {
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

	:global(.take-remove-button) {
		align-self: center;
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

	.field-hint {
		margin: 0;
		font-size: var(--text-annotation);
		color: var(--ink-muted);
		line-height: 1.35;
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

	.select-control {
		appearance: none;
		padding-right: calc(var(--space-3) + var(--touch-min));
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' fill='none' viewBox='0 0 24 24'%3E%3Cpath stroke='%23000' stroke-width='2' d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
		background-position: right var(--space-2) center;
		background-repeat: no-repeat;
		background-size: 1rem 1rem;
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
