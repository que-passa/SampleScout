<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import {
		captureController,
		getCaptureSnapshot,
		importAudioFiles,
		onTakeInventoryChanged
	} from '$lib/state';
	import { detectCapabilities } from '$lib/capabilities';
	import { countPendingDraftTakes } from '$lib/persistence';
	import CaptureTimer from '$lib/ui/components/CaptureTimer.svelte';
	import LiveWaveform from '$lib/ui/components/LiveWaveform.svelte';
	import RecordControl from '$lib/ui/components/RecordControl.svelte';
	import AppShell from '$lib/ui/layouts/AppShell.svelte';
	import type { CapabilityReport } from '$lib/capabilities';

	let capabilities = $state<CapabilityReport | null>(null);
	const initialSnap = getCaptureSnapshot();
	let snap = $state(initialSnap);
	const initialSessionName = initialSnap.session?.name ?? 'Field Session';
	let sessionName = $state(initialSessionName);
	let editingTitle = $state(false);
	let draftTitle = $state(initialSessionName);
	let titleBeforeEdit = $state(initialSessionName);
	let syncedSessionName = $state<string | null>(initialSnap.session?.name ?? null);
	let pendingDraftCount = $state(0);
	let importing = $state(false);
	let importStatus = $state<string | null>(null);
	let importError = $state<string | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);

	function autofocusTitle(node: HTMLInputElement) {
		node.focus();
		node.select();
	}

	function syncSessionNameFromSnap() {
		const name = snap.session?.name;
		if (name && name !== syncedSessionName && !editingTitle) {
			syncedSessionName = name;
			sessionName = name;
			draftTitle = name;
		}
	}

	async function refreshPendingDraftCount() {
		try {
			pendingDraftCount = await countPendingDraftTakes();
		} catch {
			pendingDraftCount = 0;
		}
	}

	onMount(() => {
		const unsub = captureController.subscribe(() => {
			snap = getCaptureSnapshot();
			syncSessionNameFromSnap();
			void refreshPendingDraftCount();
		});
		const unsubInventory = onTakeInventoryChanged(() => refreshPendingDraftCount());
		// hydrate() is a no-op notify when already ready — sync from current snapshot on remount.
		snap = getCaptureSnapshot();
		syncSessionNameFromSnap();
		void captureController.hydrate().then(() => {
			snap = getCaptureSnapshot();
			syncSessionNameFromSnap();
		});
		void refreshPendingDraftCount();
		void detectCapabilities().then((report) => {
			capabilities = report;
		});
		return () => {
			unsub();
			unsubInventory();
		};
	});

	const canRecord = $derived(capabilities?.canRecord ?? false);
	const isRecording = $derived(snap.phase === 'recording');
	const showTimer = $derived(
		isRecording || (snap.elapsedSeconds > 0 && snap.phase === 'finalizing')
	);
	const canCancel = $derived(snap.phase === 'recording');
	const isDisabled = $derived(
		!canRecord ||
			!snap.ready ||
			snap.phase === 'finalizing' ||
			snap.phase === 'requesting' ||
			snap.phase === 'blocked'
	);
	const showDraftsLink = $derived(!isRecording);

	function startTitleEdit() {
		titleBeforeEdit = sessionName;
		draftTitle = sessionName;
		editingTitle = true;
	}

	async function commitTitle() {
		if (!editingTitle) return;
		editingTitle = false;
		const next = draftTitle.trim() || titleBeforeEdit;
		sessionName = next;
		draftTitle = next;
		syncedSessionName = next;
		await captureController.setSessionName(sessionName);
	}

	function cancelTitle() {
		draftTitle = titleBeforeEdit;
		sessionName = titleBeforeEdit;
		editingTitle = false;
	}

	function onTitleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			void commitTitle();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			cancelTitle();
		}
	}

	function bindFileInput(node: HTMLInputElement) {
		fileInput = node;
		return () => {
			if (fileInput === node) fileInput = null;
		};
	}

	function openImportPicker() {
		if (importing) return;
		importError = null;
		fileInput?.click();
	}

	async function onImportFiles(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const files = input.files ? Array.from(input.files) : [];
		input.value = '';
		if (files.length === 0) return;

		importing = true;
		importError = null;
		importStatus = `Importing ${files.length} file${files.length === 1 ? '' : 's'}…`;

		try {
			const result = await importAudioFiles(files);
			const ok = result.imported.length;
			const fail = result.errors.length;
			if (ok > 0) {
				await refreshPendingDraftCount();
			}
			if (ok > 0 && fail === 0) {
				importStatus = `Imported ${ok} Local Draft${ok === 1 ? '' : 's'}.`;
			} else if (ok > 0 && fail > 0) {
				importStatus = `Imported ${ok}; ${fail} failed.`;
				importError = result.errors.map((error) => error.message).join(' ');
			} else {
				importStatus = null;
				importError = result.errors.map((error) => error.message).join(' ') || 'Import failed.';
			}
		} catch (cause) {
			importStatus = null;
			importError =
				cause && typeof cause === 'object' && 'message' in cause
					? String((cause as { message: string }).message)
					: 'Import failed.';
		} finally {
			importing = false;
		}
	}
</script>

<svelte:head>
	<title>Capture · SampleScout</title>
</svelte:head>

<AppShell>
	<section class="capture">
		<div class="stage">
			<!-- Always mounted so the lower band stays pinned idle ↔ recording. -->
			<div class="meters" aria-hidden={!showTimer}>
				{#if showTimer}
					<div class="meters-header">
						<CaptureTimer
							elapsedSeconds={snap.elapsedSeconds}
							remainingSeconds={snap.remainingSeconds}
							warning={snap.warning}
						/>
					</div>
					<div class="wave-row">
						<LiveWaveform
							peaks={snap.livePeaks}
							peakCount={snap.livePeaks.length}
							clipping={snap.levels.clipping}
							active={isRecording}
						/>
					</div>
				{/if}
			</div>

			<div class="lower">
				<div class="record-row">
					<div class="record-side"></div>
					<div class="record-center">
						<RecordControl
							disabled={isDisabled}
							recording={isRecording}
							onclick={() => captureController.toggleRecord()}
						/>
					</div>
					<div class="record-side record-side-end">
						<!-- Stacked in one cell so Collection ↔ Discard does not reflow the row. -->
						<a
							class="drafts-link"
							class:slot-hidden={!showDraftsLink}
							href={resolve('/drafts')}
							tabindex={showDraftsLink ? undefined : -1}
							aria-hidden={!showDraftsLink}
							aria-label={pendingDraftCount > 0
								? `${pendingDraftCount} Local Draft${pendingDraftCount === 1 ? '' : 's'} in Collection`
								: 'Open Collection'}
							title="Collection"
						>
							<svg
								class="drafts-icon"
								viewBox="0 0 24 24"
								width="20"
								height="20"
								aria-hidden="true"
								focusable="false"
							>
								<rect fill="currentColor" x="3" y="9" width="2" height="6" rx="0.5" />
								<rect fill="currentColor" x="7" y="5" width="2" height="14" rx="0.5" />
								<rect fill="currentColor" x="11" y="7" width="2" height="10" rx="0.5" />
								<rect fill="currentColor" x="15" y="4" width="2" height="16" rx="0.5" />
								<rect fill="currentColor" x="19" y="8" width="2" height="8" rx="0.5" />
							</svg>
							{#if pendingDraftCount > 0}
								<span class="drafts-count">{pendingDraftCount}</span>
							{:else}
								<span class="drafts-label">Collection</span>
							{/if}
						</a>
						<button
							type="button"
							class="discard-button"
							class:slot-hidden={!canCancel}
							tabindex={canCancel ? undefined : -1}
							aria-hidden={!canCancel}
							disabled={!canCancel}
							onclick={() => captureController.cancelRecording()}
							aria-label="Discard recording"
							title="Discard recording"
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
							<span class="visually-hidden">Discard</span>
						</button>
					</div>
				</div>

				<div class="session-title">
					{#if editingTitle}
						<input
							{@attach autofocusTitle}
							type="text"
							class="session-input"
							bind:value={draftTitle}
							onblur={() => void commitTitle()}
							onkeydown={onTitleKeydown}
							placeholder="Field Session name"
							aria-label="Field Session name"
						/>
					{:else}
						<button type="button" class="session-display" onclick={startTitleEdit}>
							{sessionName}
						</button>
					{/if}
				</div>

				<div class="status-slot" aria-live="polite">
					{#if snap.statusMessage}
						<p class="status-hint">{snap.statusMessage}</p>
					{/if}
					{#if importStatus}
						<p class="import-status" role="status">{importStatus}</p>
					{/if}
					{#if importError}
						<p class="import-error" role="alert">{importError}</p>
					{/if}
				</div>

				<input
					{@attach bindFileInput}
					type="file"
					accept="audio/*"
					multiple
					class="file-input"
					onchange={(event) => void onImportFiles(event)}
				/>
			</div>

			<!-- Overlay so capability/error banners never shift the record + title band. -->
			{#if snap.error || (capabilities && (!canRecord || !capabilities.canPersistDrafts))}
				<div class="capture-alerts">
					{#if snap.error}
						<div class="error-banner">
							<strong>Error:</strong>
							{snap.error.message}
						</div>
					{/if}

					{#if capabilities && !canRecord}
						<div class="warning-banner">
							<p>
								Recording requires a secure context, microphone permission, and MediaRecorder
								support.
							</p>
							{#if capabilities.canPersistDrafts}
								<button
									type="button"
									class="import-fallback"
									onclick={openImportPicker}
									disabled={importing}
								>
									Import audio instead
								</button>
							{/if}
						</div>
					{/if}

					{#if capabilities && !capabilities.canPersistDrafts}
						<div class="warning-banner">
							Local storage is not available. Takes cannot be saved as Local Drafts on this device.
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</section>
</AppShell>

<style>
	.capture {
		box-sizing: border-box;
		height: 100%;
		min-height: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		padding-top: var(--space-4);
		padding-inline: 0;
		padding-bottom: 0;
		width: 100%;
	}

	.stage {
		position: relative;
		display: grid;
		grid-template-rows: minmax(0, 1fr) auto;
		flex: 1;
		align-items: stretch;
		gap: var(--space-4);
		margin-top: 0;
		min-height: 0;
		max-height: 100%;
		overflow: hidden;
		width: 100%;
		max-width: none;
	}

	.meters {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		width: 100%;
		min-height: 0;
	}

	.meters-header {
		flex-shrink: 0;
		display: flex;
		justify-content: center;
		width: 100%;
		padding-inline: var(--space-4);
		box-sizing: border-box;
	}

	.wave-row {
		flex: 1;
		min-height: 0;
		width: 100%;
	}

	.lower {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-4);
		width: 100%;
		max-width: 28rem;
		margin-inline: auto;
		padding-inline: var(--space-4);
		padding-bottom: var(--space-7);
		box-sizing: border-box;
	}

	.capture-alerts {
		position: absolute;
		z-index: 1;
		top: var(--space-4);
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-3);
		width: calc(100% - var(--space-4) * 2);
		max-width: 32rem;
		pointer-events: none;
	}

	.capture-alerts :is(.error-banner, .warning-banner, .import-fallback) {
		pointer-events: auto;
	}

	.record-row,
	.session-title,
	.status-slot {
		flex-shrink: 0;
	}

	.record-row {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: start;
		width: 100%;
	}

	.record-center {
		display: flex;
		justify-content: center;
	}

	.record-side {
		display: grid;
		align-items: center;
		justify-items: start;
		/* Match RecordControl `.well` height so side controls center on the circle, not the label. */
		min-height: calc(var(--space-7) * 2 + var(--space-3) * 2);
		padding-left: var(--space-2);
		padding-right: var(--space-6);
	}

	.record-side-end {
		justify-items: end;
		padding-right: var(--space-2);
		padding-left: var(--space-6);
	}

	.record-side-end > * {
		grid-area: 1 / 1;
	}

	.slot-hidden {
		visibility: hidden;
		pointer-events: none;
	}

	.drafts-link {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: var(--touch-min);
		min-width: var(--touch-min);
		padding: 0 var(--space-3);
		border: 1px solid var(--line);
		border-radius: var(--radius-control);
		background: var(--surface);
		color: var(--ink);
		text-decoration: none;
		font-size: var(--text-meta);
		font-weight: 600;
	}

	.drafts-link:hover {
		background: var(--surface-subtle);
	}

	.drafts-link:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}

	.drafts-icon {
		display: block;
		flex-shrink: 0;
		color: var(--ink-muted);
	}

	.drafts-count {
		font-variant-numeric: tabular-nums;
		letter-spacing: 0.02em;
	}

	.drafts-label {
		font-size: var(--text-annotation);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.discard-button {
		display: inline-grid;
		place-items: center;
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

	.discard-button:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}

	.trash-icon {
		display: block;
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.session-title {
		width: 100%;
		display: flex;
		justify-content: center;
		/* Extra separation from the record control; keep constant idle ↔ recording. */
		margin-top: var(--space-5);
	}

	.status-slot {
		box-sizing: border-box;
		width: 100%;
		/* Reserve ~2 meta lines so status appear/clear does not shift record + title. */
		min-height: calc(var(--text-meta) * 1.35 * 2);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: flex-start;
		gap: var(--space-1);
	}

	.session-display,
	.session-input {
		box-sizing: border-box;
		width: 100%;
		max-width: 24rem;
		min-height: var(--touch-min);
		padding: var(--space-2) var(--space-3);
		border: 1px solid transparent;
		border-radius: var(--radius-control);
		font-family: var(--font-mono);
		font-size: var(--text-screen);
		font-weight: 600;
		line-height: 1.25;
		text-align: center;
		color: var(--ink);
	}

	.session-display {
		background: transparent;
		border-bottom-color: var(--line);
		cursor: pointer;
	}

	.session-display:hover {
		border-bottom-color: var(--ink-muted);
	}

	.session-display:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}

	.session-input {
		border-color: var(--ink);
		background: var(--surface);
	}

	.session-input:focus {
		outline: none;
	}

	.status-hint {
		margin: 0;
		font-size: var(--text-meta);
		line-height: 1.35;
		color: var(--ink-muted);
		text-align: center;
	}

	.error-banner,
	.warning-banner {
		padding: var(--space-3);
		border: 1px solid var(--signal);
		border-radius: var(--radius-panel);
		background: var(--surface);
		color: var(--signal);
		font-size: var(--text-body);
		text-align: center;
		max-width: 32rem;
	}

	.warning-banner {
		border-color: var(--line-strong);
		color: var(--ink-muted);
	}

	.warning-banner p {
		margin: 0;
	}

	.import-fallback {
		margin-top: var(--space-3);
		min-height: var(--touch-min);
		padding: 0 var(--space-4);
		border: 1px solid var(--ink);
		border-radius: var(--radius-control);
		background: var(--surface);
		color: var(--ink);
		font-size: var(--text-button);
		font-weight: 600;
	}

	.import-fallback:disabled {
		opacity: 0.5;
	}

	.import-status {
		margin: 0;
		font-size: var(--text-meta);
		color: var(--ink-muted);
		text-align: center;
	}

	.import-error {
		margin: 0;
		font-size: var(--text-meta);
		color: var(--ink);
		text-align: center;
	}

	.file-input {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	@media (min-width: 900px) {
		.capture {
			padding-top: var(--space-5);
		}

		.meters-header,
		.lower {
			padding-inline: var(--space-5);
		}
	}
</style>
