<script lang="ts">
	import { untrack } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import {
		estimateEncodedByteLength,
		formatByteEstimate,
		encodeAndPersistTakeOutput
	} from '$lib/audio/encode';
	import {
		formatUploadStateLabel,
		isActiveTakeUploadState,
		isActiveUploadJobState,
		validateTakeForUpload,
		type OutputSettings,
		type Take
	} from '$lib/domain';
	import {
		actionToast,
		saveTakeOutput,
		enqueueTakeUpload,
		retryTakeUpload,
		cancelTakeUpload,
		uploadQueue,
		openAccountOverlay
	} from '$lib/state';
	import { audiotoolAuth } from '$lib/state/audiotool-auth.svelte';
	import { acquirePreventUnload } from '$lib/state/prevent-unload';

	type PresetId = 'wav-16' | 'wav-24' | 'mp3-96' | 'mp3-128' | 'mp3-192';

	let {
		take,
		channelCount = 1,
		sampleRate = 48000,
		durationSeconds,
		disabled = false,
		embedded = false,
		onsaved,
		onuploaded,
		onactivechange
	}: {
		take: Take;
		channelCount?: number;
		sampleRate?: number;
		durationSeconds: number;
		disabled?: boolean;
		/** When true, omit top margin/border (transport sheet). */
		embedded?: boolean;
		onsaved: (take: Take) => void | Promise<void>;
		onuploaded?: (take: Take) => void | Promise<void>;
		/** Fires when local encoding or queue upload activity flips. */
		onactivechange?: (active: boolean) => void;
	} = $props();

	const sourceKey = $derived(
		[
			take.id,
			take.output.format,
			take.output.format === 'wav'
				? take.output.bitDepth
				: take.output.format === 'mp3'
					? take.output.bitrateKbps
					: 'source',
			take.renderedAsset?.hash ?? ''
		].join('\u0000')
	);

	class UploadDraft {
		preset = $state<PresetId>('wav-16');

		constructor(output: OutputSettings) {
			this.preset = presetFromOutput(output);
		}
	}

	const draft = $derived.by(() => {
		void sourceKey;
		return untrack(() => new UploadDraft(take.output));
	});

	let encoding = $state(false);
	let encodeProgress = $state(0);
	let encodeError = $state<string | null>(null);
	let uploadError = $state<string | null>(null);
	let uploadBusy = $state(false);
	let abortController = $state.raw<AbortController | null>(null);
	let lastNotifiedCompletedJobId: string | null = null;
	/** 'Preparing' vs 'Encoding' for the local prepare/re-encode action. */
	let localEncodeLabel = $state<'Preparing' | 'Encoding'>('Encoding');

	const reduceMotion = new MediaQuery('prefers-reduced-motion: reduce');

	const selectedOutput = $derived(outputFromPreset(draft.preset));

	const estimateBytes = $derived(
		estimateEncodedByteLength(
			durationSeconds,
			channelCount || take.source.channelCount || 1,
			sampleRate || take.source.sampleRate || 48000,
			selectedOutput
		)
	);

	const isDirty = $derived(presetFromOutput(take.output) !== draft.preset);

	const hasFreshRender = $derived(
		Boolean(take.renderedAsset && !isDirty && presetFromOutput(take.output) === draft.preset)
	);

	const job = $derived(uploadQueue.byTakeId[take.id]);

	const uploadActive = $derived(
		isActiveTakeUploadState(take.uploadState) || (job != null && isActiveUploadJobState(job.state))
	);

	const authConnected = $derived(audiotoolAuth.status.state === 'connected');

	const isUploaded = $derived(take.uploadState === 'uploaded' || job?.state === 'completed');

	const isFailed = $derived(take.uploadState === 'failed' || job?.state === 'failed');

	const progressActive = $derived(encoding || uploadActive);

	const progressPhaseLabel = $derived(
		encoding ? localEncodeLabel : formatUploadStateLabel(job?.state ?? take.uploadState)
	);

	const progressFraction = $derived(encoding ? encodeProgress : (job?.progress?.fraction ?? null));

	const hasDeterminateProgress = $derived(
		progressFraction != null && Number.isFinite(progressFraction)
	);

	const failedMessage = $derived(
		job?.error?.message ?? take.lastError?.message ?? 'Upload failed.'
	);

	$effect(() => {
		onactivechange?.(progressActive);
	});

	$effect(() => {
		const current = job;
		if (!current || current.state !== 'completed') return;
		if (lastNotifiedCompletedJobId === current.id) return;
		lastNotifiedCompletedJobId = current.id;
		const label = current.audiotoolSampleName ?? take.metadata.displayName;
		actionToast.show(`Uploaded · ${label}`);
		if (onuploaded) {
			void onuploaded(take);
		}
	});

	async function persistPreset(): Promise<Take> {
		return saveTakeOutput(take.id, selectedOutput);
	}

	async function onPrepareFile(): Promise<void> {
		if (disabled || encoding || uploadActive) return;
		encodeError = null;
		uploadError = null;
		localEncodeLabel = hasFreshRender ? 'Encoding' : 'Preparing';
		encoding = true;
		encodeProgress = 0;
		const controller = new AbortController();
		abortController = controller;
		const releaseUnload = acquirePreventUnload();

		try {
			let current = take;
			if (isDirty) {
				current = await persistPreset();
				await onsaved(current);
			}

			const result = await encodeAndPersistTakeOutput(current, {
				output: selectedOutput,
				signal: controller.signal,
				onProgress: (fraction) => {
					encodeProgress = fraction;
				}
			});
			await onsaved(result.take);
			encodeProgress = 1;
		} catch (cause) {
			if (cause instanceof DOMException && cause.name === 'AbortError') {
				encodeError = 'Encode canceled.';
			} else {
				encodeError = cause instanceof Error ? cause.message : 'Could not encode file.';
			}
		} finally {
			encoding = false;
			abortController = null;
			releaseUnload();
		}
	}

	function onCancelEncode(): void {
		abortController?.abort();
	}

	async function onUploadToAudiotool(): Promise<void> {
		if (disabled || encoding || uploadActive || uploadBusy) return;
		uploadError = null;
		encodeError = null;

		const validation = validateTakeForUpload(take);
		if (validation) {
			uploadError = validation.message;
			return;
		}

		uploadBusy = true;
		try {
			let current = take;
			if (isDirty) {
				current = await persistPreset();
				await onsaved(current);
			}
			await enqueueTakeUpload(current.id);
		} catch (cause) {
			uploadError = errorMessage(cause, 'Could not start upload.');
		} finally {
			uploadBusy = false;
		}
	}

	async function onRetryUpload(): Promise<void> {
		if (disabled || encoding || uploadActive || uploadBusy) return;
		uploadError = null;
		encodeError = null;

		const validation = validateTakeForUpload(take);
		if (validation) {
			uploadError = validation.message;
			return;
		}

		uploadBusy = true;
		try {
			let current = take;
			if (isDirty) {
				current = await persistPreset();
				await onsaved(current);
			}
			await retryTakeUpload(current.id);
			if (onuploaded) await onuploaded(current);
			else await onsaved(current);
		} catch (cause) {
			uploadError = errorMessage(cause, 'Could not retry upload.');
		} finally {
			uploadBusy = false;
		}
	}

	async function onCancelUpload(): Promise<void> {
		uploadError = null;
		try {
			await cancelTakeUpload(take.id);
		} catch (cause) {
			uploadError = errorMessage(cause, 'Could not cancel upload.');
		}
	}

	function onCancelProgress(): void {
		if (encoding) {
			onCancelEncode();
			return;
		}
		void onCancelUpload();
	}

	function errorMessage(cause: unknown, fallback: string): string {
		if (cause && typeof cause === 'object' && 'message' in cause) {
			const message = (cause as { message: unknown }).message;
			if (typeof message === 'string' && message.trim()) return message;
		}
		if (cause instanceof Error && cause.message.trim()) return cause.message;
		return fallback;
	}

	function presetFromOutput(output: OutputSettings): PresetId {
		if (output.format === 'wav') {
			return output.bitDepth === 24 ? 'wav-24' : 'wav-16';
		}
		if (output.format === 'mp3') {
			if (output.bitrateKbps === 96) return 'mp3-96';
			if (output.bitrateKbps === 192) return 'mp3-192';
			return 'mp3-128';
		}
		return 'wav-16';
	}

	function outputFromPreset(preset: PresetId): Extract<OutputSettings, { format: 'wav' | 'mp3' }> {
		switch (preset) {
			case 'wav-24':
				return { format: 'wav', bitDepth: 24 };
			case 'mp3-96':
				return { format: 'mp3', bitrateKbps: 96 };
			case 'mp3-128':
				return { format: 'mp3', bitrateKbps: 128 };
			case 'mp3-192':
				return { format: 'mp3', bitrateKbps: 192 };
			default:
				return { format: 'wav', bitDepth: 16 };
		}
	}
</script>

<section class={['upload-panel', embedded && 'embedded']} aria-label="Upload to Audiotool">
	{#if progressActive}
		<div class="progress-phase" role="status" aria-live="polite">
			<span class="progress-label">
				{progressPhaseLabel}
				{#if hasDeterminateProgress}
					· {Math.round((progressFraction as number) * 100)}%
				{/if}
			</span>
			{#if hasDeterminateProgress}
				<div class="progress-track" aria-hidden="true">
					<div
						class="progress-fill"
						style={`width: ${Math.round((progressFraction as number) * 100)}%`}
					></div>
				</div>
			{:else if reduceMotion.current}
				<div class="progress-track progress-track-muted" aria-hidden="true"></div>
			{:else}
				<div class="progress-track progress-track-indeterminate" aria-hidden="true">
					<div class="progress-fill-indeterminate"></div>
				</div>
			{/if}
			<button type="button" class="secondary-button cancel-button" onclick={onCancelProgress}>
				Cancel
			</button>
		</div>
	{:else if isUploaded}
		<p class="upload-status" role="status">
			Uploaded to Audiotool
			{#if job?.audiotoolSampleName}
				· {job.audiotoolSampleName}
			{/if}
		</p>
	{:else if isFailed}
		<p class="error" role="alert">{failedMessage}</p>
		{#if uploadError}
			<p class="error" role="alert">{uploadError}</p>
		{/if}
		<button
			type="button"
			class="primary-button"
			disabled={disabled || uploadBusy}
			onclick={() => void onRetryUpload()}
		>
			Retry
		</button>
	{:else}
		<span class="label">Upload</span>
		<p class="hint">Encodes on this device, then uploads to Audiotool.</p>

		<label class="field">
			<span class="field-label">Format</span>
			<select
				class="control"
				bind:value={draft.preset}
				disabled={disabled || encoding || uploadActive}
				aria-label="Upload format"
			>
				<option value="wav-16">WAV · 16-bit PCM</option>
				<option value="wav-24">WAV · 24-bit PCM</option>
				<option value="mp3-96">MP3 · 96 kbps (compact)</option>
				<option value="mp3-128">MP3 · 128 kbps</option>
				<option value="mp3-192">MP3 · 192 kbps (high)</option>
			</select>
		</label>

		{#if estimateBytes != null}
			<p class="estimate" aria-live="polite">
				Estimate {formatByteEstimate(estimateBytes)}
				{#if hasFreshRender && take.renderedAsset}
					· Ready {formatByteEstimate(take.renderedAsset.byteLength)}
				{/if}
			</p>
		{/if}

		<div class="actions">
			{#if !authConnected}
				<button
					type="button"
					class="primary-button"
					{disabled}
					onclick={() => openAccountOverlay()}
				>
					Connect to upload
				</button>
			{:else}
				<button
					type="button"
					class="primary-button"
					disabled={disabled || uploadBusy}
					onclick={() => void onUploadToAudiotool()}
				>
					Upload to Audiotool
				</button>
			{/if}

			<button
				type="button"
				class="secondary-button"
				{disabled}
				onclick={() => void onPrepareFile()}
			>
				{hasFreshRender ? 'Re-encode' : 'Prepare file'}
			</button>
		</div>

		{#if encodeError}
			<p class="error" role="alert">{encodeError}</p>
		{/if}
		{#if uploadError}
			<p class="error" role="alert">{uploadError}</p>
		{/if}
	{/if}
</section>

<style>
	.upload-panel {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		margin-top: var(--space-4);
		padding-top: var(--space-4);
		border-top: 1px solid var(--line);
	}

	.upload-panel.embedded {
		margin-top: 0;
		padding-top: 0;
		border-top: none;
	}

	.label {
		font-size: var(--text-label);
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}

	.hint {
		margin: 0;
		font-size: var(--text-meta);
		color: var(--ink-muted);
		line-height: 1.4;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.field-label {
		font-size: var(--text-meta);
		color: var(--ink-muted);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.control {
		min-height: var(--touch-min);
		padding: 0 var(--space-3);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-control);
		background: var(--surface);
		color: var(--ink);
		font-family: var(--font-mono);
		font-size: var(--text-body);
	}

	.estimate {
		margin: 0;
		font-size: var(--text-meta);
		color: var(--ink-muted);
	}

	.actions {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.progress-phase {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.progress-label {
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

	.progress-track-muted {
		background: color-mix(in srgb, var(--ink-muted) 18%, var(--surface-subtle));
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

	.cancel-button {
		align-self: stretch;
	}

	.upload-status {
		margin: 0;
		font-size: var(--text-body);
		color: var(--ink);
	}

	.primary-button,
	.secondary-button {
		min-height: var(--touch-min);
		padding: 0 var(--space-4);
		border-radius: var(--radius-control);
		font-family: var(--font-mono);
		font-size: var(--text-button);
		cursor: pointer;
	}

	.primary-button {
		border: 1px solid var(--ink);
		background: var(--ink);
		color: var(--surface);
	}

	.primary-button:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.secondary-button {
		align-self: flex-start;
		border: 1px solid var(--line-strong);
		background: var(--surface);
		color: var(--ink);
	}

	.secondary-button:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.error {
		margin: 0;
		color: var(--signal);
		font-size: var(--text-meta);
	}
</style>
