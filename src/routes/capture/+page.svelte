<script lang="ts">
	import { onMount } from 'svelte';
	import {
		actionToast,
		captureController,
		getCaptureSnapshot,
		importAudioFiles,
		onTakeInventoryChanged
	} from '$lib/state';
	import {
		DEFAULT_SESSION_NAME,
		normalizeSessionName,
		rememberSessionNamePreset
	} from '$lib/domain';
	import {
		detectCapabilities,
		explainPersistLimitations,
		explainRecordingLimitations,
		formatBytes
	} from '$lib/capabilities';
	import {
		countCollectionFiles,
		getAppSettings,
		putCapturePreferences,
		putSessionNamePresets
	} from '$lib/persistence';
	import { DEFAULT_RECORDING_SETTINGS } from '$lib/config/recording-settings';
	import { DEFAULT_UPLOAD_OUTPUT, normalizeUploadOutput } from '$lib/config/upload-output';
	import type { RecordingSettings } from '$lib/domain/types';
	import CaptureSettingsSheet from '$lib/ui/components/CaptureSettingsSheet.svelte';
	import CaptureTimer from '$lib/ui/components/CaptureTimer.svelte';
	import CollectionShortcut from '$lib/ui/components/CollectionShortcut.svelte';
	import GhostButton from '$lib/ui/components/GhostButton.svelte';
	import LiveWaveform from '$lib/ui/components/LiveWaveform.svelte';
	import RecordControl from '$lib/ui/components/RecordControl.svelte';
	import SessionNameSheet from '$lib/ui/components/SessionNameSheet.svelte';
	import StandbyPlot from '$lib/ui/components/StandbyPlot.svelte';
	import AppShell from '$lib/ui/layouts/AppShell.svelte';
	import { Icon } from '$lib/ui/icons';
	import type { CapabilityReport } from '$lib/capabilities';

	let capabilities = $state<CapabilityReport | null>(null);
	const initialSnap = getCaptureSnapshot();
	let snap = $state(initialSnap);
	const initialSessionName = initialSnap.session?.name ?? DEFAULT_SESSION_NAME;
	let sessionName = $state(initialSessionName);
	let nameSheetOpen = $state(false);
	let settingsSheetOpen = $state(false);
	let recordingSettings = $state<RecordingSettings>({ ...DEFAULT_RECORDING_SETTINGS });
	let preferredOutput = $state(normalizeUploadOutput(DEFAULT_UPLOAD_OUTPUT));
	let userPresets = $state<string[]>([]);
	let syncedSessionName = $state<string | null>(initialSnap.session?.name ?? null);
	let pendingFileCount = $state(0);
	let totalFileCount = $state(0);
	let importing = $state(false);
	let fileInput = $state<HTMLInputElement | null>(null);

	function syncSessionNameFromSnap() {
		const name = snap.session?.name;
		if (name && name !== syncedSessionName && !nameSheetOpen) {
			syncedSessionName = name;
			sessionName = name;
		}
	}

	async function refreshCollectionCounts() {
		try {
			const counts = await countCollectionFiles();
			pendingFileCount = counts.pending;
			totalFileCount = counts.total;
		} catch {
			pendingFileCount = 0;
			totalFileCount = 0;
		}
	}

	async function loadCapturePreferences() {
		try {
			const settings = await getAppSettings();
			recordingSettings = settings.recordingSettings;
			preferredOutput = normalizeUploadOutput(settings.preferredOutput);
		} catch {
			recordingSettings = { ...DEFAULT_RECORDING_SETTINGS };
			preferredOutput = normalizeUploadOutput(DEFAULT_UPLOAD_OUTPUT);
		}
	}

	async function loadUserPresets() {
		try {
			const settings = await getAppSettings();
			userPresets = settings.sessionNamePresets;
		} catch {
			userPresets = [];
		}
	}

	onMount(() => {
		const unsub = captureController.subscribe(() => {
			snap = getCaptureSnapshot();
			syncSessionNameFromSnap();
			void refreshCollectionCounts();
		});
		const unsubInventory = onTakeInventoryChanged(() => refreshCollectionCounts());
		// hydrate() is a no-op notify when already ready — sync from current snapshot on remount.
		snap = getCaptureSnapshot();
		syncSessionNameFromSnap();
		void captureController.hydrate().then(() => {
			snap = getCaptureSnapshot();
			syncSessionNameFromSnap();
		});
		void refreshCollectionCounts();
		void loadCapturePreferences();
		void loadUserPresets();
		void detectCapabilities().then((report) => {
			capabilities = report;
		});
		return () => {
			unsub();
			unsubInventory();
		};
	});

	const canRecord = $derived(capabilities?.canRecord ?? false);
	const canPersistFiles = $derived(capabilities?.canPersistFiles ?? false);
	const storageBlocksCapture = $derived(capabilities?.storageOkForMaxRecording === false);
	const recordingLimitations = $derived(
		capabilities ? explainRecordingLimitations(capabilities) : []
	);
	const persistLimitations = $derived(
		capabilities ? explainPersistLimitations(capabilities) : []
	);
	const storageError = $derived(
		snap.error?.code === 'STORAGE_INSUFFICIENT' || snap.error?.code === 'STORAGE_CHECK_FAILED'
	);
	/**
	 * Disable Record only when mic/recorder or Local File persistence cannot succeed.
	 * Low storage is warned + gated live at start so freeing space remains retryable.
	 */
	const canArmRecord = $derived(canRecord && canPersistFiles);
	/** Idle header decoration: STANDBY when armed; NO MIC / NO SAVE / LOW SPACE otherwise. */
	const standbyLabel = $derived(
		capabilities && !canRecord
			? 'NO MIC'
			: capabilities && !canPersistFiles
				? 'NO SAVE'
				: storageBlocksCapture
					? 'LOW SPACE'
					: 'STANDBY'
	);
	const standbyPlotAria = $derived(
		capabilities && !canRecord
			? 'Capture plot — microphone not available'
			: capabilities && !canPersistFiles
				? 'Capture plot — Local File storage unavailable'
				: storageBlocksCapture
					? 'Capture plot — not enough free space'
					: 'Capture plot on standby'
	);
	const isRecording = $derived(snap.phase === 'recording');
	const showTimer = $derived(
		isRecording || (snap.elapsedSeconds > 0 && snap.phase === 'finalizing')
	);
	const canCancel = $derived(snap.phase === 'recording');
	const settingsDisabled = $derived(
		isRecording || snap.phase === 'finalizing' || snap.phase === 'requesting'
	);
	const isDisabled = $derived(
		!canArmRecord ||
			!snap.ready ||
			snap.phase === 'finalizing' ||
			snap.phase === 'requesting'
	);
	const showCollectionLink = $derived(!isRecording);
	const showImportFallback = $derived(
		canPersistFiles && (!canRecord || storageBlocksCapture || storageError)
	);
	const showCapabilityAlerts = $derived(
		Boolean(
			snap.error ||
				(capabilities && (!canRecord || !canPersistFiles || storageBlocksCapture))
		)
	);
	const collectionAriaLabel = $derived(
		totalFileCount > 0
			? pendingFileCount > 0
				? `${pendingFileCount} pending of ${totalFileCount} Local File${totalFileCount === 1 ? '' : 's'} in Collection`
				: `${totalFileCount} Local File${totalFileCount === 1 ? '' : 's'} in Collection`
			: 'Open Collection'
	);

	function storageDetail(error: NonNullable<typeof snap.error>): string | null {
		const available = error.context?.availableBytes;
		const required = error.context?.requiredBytes;
		if (typeof available !== 'number' || typeof required !== 'number') return null;
		return `About ${formatBytes(available)} free; need roughly ${formatBytes(required)}.`;
	}

	function openSettingsSheet() {
		settingsSheetOpen = true;
	}

	function closeSettingsSheet() {
		settingsSheetOpen = false;
	}

	async function applyCaptureSettings(next: {
		recordingSettings: RecordingSettings;
		preferredOutput: typeof preferredOutput;
	}) {
		try {
			const saved = await putCapturePreferences(next);
			recordingSettings = saved.recordingSettings;
			preferredOutput = normalizeUploadOutput(saved.preferredOutput);
		} catch {
			// Keep draft values if persistence fails.
		}
		settingsSheetOpen = false;
	}

	function openNameSheet() {
		nameSheetOpen = true;
	}

	function closeNameSheet() {
		nameSheetOpen = false;
	}

	async function applySessionName(raw: string) {
		const next = normalizeSessionName(raw);
		sessionName = next;
		syncedSessionName = next;
		nameSheetOpen = false;
		await captureController.setSessionName(next);
		const remembered = rememberSessionNamePreset(userPresets, next);
		if (
			remembered.length !== userPresets.length ||
			remembered.some((value, index) => value !== userPresets[index])
		) {
			userPresets = remembered;
			try {
				await putSessionNamePresets(remembered);
			} catch {
				// Session rename still applies if preset persistence fails.
			}
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
		fileInput?.click();
	}

	async function onImportFiles(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const files = input.files ? Array.from(input.files) : [];
		input.value = '';
		if (files.length === 0) return;

		importing = true;
		actionToast.show(`Importing ${files.length} file${files.length === 1 ? '' : 's'}…`);

		try {
			const result = await importAudioFiles(files);
			const ok = result.imported.length;
			const fail = result.errors.length;
			if (ok > 0) {
				await refreshCollectionCounts();
			}
			if (ok > 0 && fail === 0) {
				actionToast.show(`Imported ${ok} Local File${ok === 1 ? '' : 's'}`);
			} else if (ok > 0 && fail > 0) {
				actionToast.show(`Imported ${ok}; ${fail} failed`);
			} else {
				actionToast.show(result.errors[0]?.message || 'Import failed');
			}
		} catch (cause) {
			actionToast.show(
				cause && typeof cause === 'object' && 'message' in cause
					? String((cause as { message: string }).message)
					: 'Import failed.'
			);
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
			<div class="meters">
				<!-- Header always reserved so idle standby axis matches live-wave vertical geometry. -->
				<div class="meters-header">
					{#if showTimer}
						<CaptureTimer
							elapsedSeconds={snap.elapsedSeconds}
							remainingSeconds={snap.remainingSeconds}
							warning={snap.warning}
						/>
					{:else}
						<div class="standby-header" aria-hidden="true">
							<div class="standby-title">{standbyLabel}</div>
							<div class="standby-remaining"></div>
						</div>
					{/if}
				</div>
				<div class="wave-row">
					<!-- Subtle corner slices — instrument frame, idle ↔ recording. -->
					<div class="wave-corners" aria-hidden="true">
						<span class="wave-corner tl"></span>
						<span class="wave-corner tr"></span>
						<span class="wave-corner bl"></span>
						<span class="wave-corner br"></span>
					</div>
					{#if showTimer}
						<LiveWaveform
							peaks={snap.livePeaks}
							peakCount={snap.livePeaks.length}
							clipping={snap.levels.clipping}
							active={isRecording}
						/>
					{:else}
						<StandbyPlot ariaLabel={standbyPlotAria} />
					{/if}
				</div>
			</div>

			<div class="lower">
				<div class="record-row">
					<div class="record-side">
						{#if canCancel}
							<GhostButton
								icon
								chrome
								danger
								disabled={!canCancel}
								onclick={() => captureController.cancelRecording()}
								aria-label="Discard recording"
								title="Discard recording"
							>
								<Icon name="trash" />
							</GhostButton>
						{:else}
							<GhostButton
								icon
								chrome
								muted
								disabled={settingsDisabled}
								onclick={openSettingsSheet}
								aria-label="Settings"
								title="Settings"
							>
								<Icon name="settings" />
							</GhostButton>
						{/if}
					</div>
					<div class="record-center">
						<RecordControl
							disabled={isDisabled}
							recording={isRecording}
							onclick={() => captureController.toggleRecord()}
						/>
					</div>
					<div class="record-side record-side-end">
						<CollectionShortcut
							totalCount={totalFileCount}
							pendingCount={pendingFileCount}
							hidden={!showCollectionLink}
							ariaLabel={collectionAriaLabel}
						/>
					</div>
				</div>

				<div class="session-title">
					<button
						type="button"
						class="session-display"
						onclick={openNameSheet}
						aria-haspopup="dialog"
						aria-label="Field Session name"
					>
						{sessionName}
					</button>
				</div>

				<div class="status-slot" aria-live="polite">
					{#if snap.statusMessage}
						<p class="status-hint">{snap.statusMessage}</p>
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
			{#if showCapabilityAlerts}
				<div class="capture-alerts">
					{#if snap.error}
						<div class="error-banner">
							<strong>Error:</strong>
							{snap.error.message}
							{#if storageDetail(snap.error)}
								<span class="error-detail">{storageDetail(snap.error)}</span>
							{/if}
							{#if showImportFallback}
								<GhostButton onclick={openImportPicker} disabled={importing}>
									Import audio instead
								</GhostButton>
							{/if}
						</div>
					{/if}

					{#if capabilities && !canRecord}
						<div class="warning-banner">
							<p>
								Recording needs a secure context, microphone permission, and MediaRecorder
								support.
							</p>
							{#if recordingLimitations.length}
								<ul class="limit-list">
									{#each recordingLimitations as reason (reason)}
										<li>{reason}</li>
									{/each}
								</ul>
							{/if}
							{#if canPersistFiles}
								<GhostButton onclick={openImportPicker} disabled={importing}>
									Import audio instead
								</GhostButton>
							{/if}
						</div>
					{:else if capabilities && !canPersistFiles}
						<div class="warning-banner">
							<p>
								Local storage is not available. Takes cannot be saved as Local Files on this
								device.
							</p>
							{#if persistLimitations.length}
								<ul class="limit-list">
									{#each persistLimitations as reason (reason)}
										<li>{reason}</li>
									{/each}
								</ul>
							{/if}
						</div>
					{:else if capabilities && storageBlocksCapture && !storageError}
						<div class="warning-banner">
							<p>
								Not enough free space for a full-length Capture. Free space on this device,
								discard files in Collection, or Import a smaller file.
							</p>
							<p class="limit-meta">
								About {formatBytes(capabilities.storageEstimate.availableBytes)} free; need
								roughly {formatBytes(capabilities.storageRequiredForMaxRecording)}.
							</p>
							{#if canPersistFiles}
								<GhostButton onclick={openImportPicker} disabled={importing}>
									Import audio instead
								</GhostButton>
							{/if}
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</section>
</AppShell>

<SessionNameSheet
	open={nameSheetOpen}
	name={sessionName}
	{userPresets}
	onclose={closeNameSheet}
	onapply={applySessionName}
/>

<CaptureSettingsSheet
	open={settingsSheetOpen}
	{recordingSettings}
	{preferredOutput}
	onclose={closeSettingsSheet}
	onapply={applyCaptureSettings}
/>

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

	/* Mirror CaptureTimer box so idle wave-row height matches recording. */
	.standby-header {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-1);
	}

	.standby-title {
		display: flex;
		align-items: center;
		min-height: var(--text-timer);
		font-size: var(--text-label);
		font-weight: 600;
		font-family: var(--font-mono);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		line-height: 1;
		color: var(--ink-muted);
	}

	.standby-remaining {
		min-height: calc(var(--text-annotation) * 1.2);
	}

	.wave-row {
		position: relative;
		flex: 1;
		min-height: 0;
		width: 100%;
		/* Nudge plot + corners up; timer / record band stay put. */
		transform: translateY(calc(-1 * var(--space-3)));
	}

	/* Corner slices of a rectangle — soft like standby scan chrome. */
	.wave-corners {
		position: absolute;
		inset-block: 0;
		inset-inline: var(--space-6);
		z-index: 1;
		pointer-events: none;
	}

	.wave-corner {
		position: absolute;
		box-sizing: border-box;
		width: var(--space-5);
		height: var(--space-5);
		border-color: color-mix(in srgb, var(--line-strong) 70%, transparent);
		border-style: solid;
		border-width: 0;
	}

	.wave-corner.tl {
		top: 0;
		left: 0;
		border-top-width: 1px;
		border-left-width: 1px;
	}

	.wave-corner.tr {
		top: 0;
		right: 0;
		border-top-width: 1px;
		border-right-width: 1px;
	}

	.wave-corner.bl {
		bottom: 0;
		left: 0;
		border-bottom-width: 1px;
		border-left-width: 1px;
	}

	.wave-corner.br {
		bottom: 0;
		right: 0;
		border-bottom-width: 1px;
		border-right-width: 1px;
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
		padding-bottom: var(--space-4);
		box-sizing: border-box;
		/* Keep record/stop reachable when the wave stage collapses (short landscape). */
		flex-shrink: 0;
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

	.capture-alerts :is(.error-banner, .warning-banner) {
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
		display: flex;
		align-items: center;
		/* Hug the record control — gap is padding only, not leftover 1fr space. */
		justify-content: flex-end;
		/* Match RecordControl `.well` height — align side controls to the record face, not the label. */
		height: calc(var(--space-7) * 2 + var(--space-3) * 2);
		padding-left: var(--space-2);
		padding-right: var(--space-6);
		min-width: 0;
	}

	.record-side-end {
		justify-content: flex-start;
		padding-right: var(--space-2);
		padding-left: var(--space-6);
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

	.session-display {
		box-sizing: border-box;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: auto;
		max-width: min(100%, 24rem);
		min-height: calc(var(--touch-min) + var(--space-2));
		padding: var(--space-3) var(--space-6);
		border: none;
		border-radius: var(--radius-round);
		font-family: var(--font-mono);
		font-size: var(--text-screen);
		font-weight: 600;
		line-height: 1.25;
		text-align: center;
		color: var(--ink);
		background: var(--surface);
		/* Match TakeRow default raised card. */
		box-shadow:
			0 1px 0 color-mix(in srgb, var(--ink) 10%, transparent),
			0 1px var(--space-1) color-mix(in srgb, var(--ink) 12%, transparent),
			inset 0 1px 0 color-mix(in srgb, var(--surface) 70%, transparent),
			inset 0 -1px 0 color-mix(in srgb, var(--ink) 8%, transparent);
		cursor: default;
	}

	@media (prefers-reduced-motion: no-preference) {
		.session-display {
			transition:
				background-color 140ms ease,
				box-shadow 140ms ease,
				transform 140ms ease;
		}
	}

	@media (hover: hover) {
		.session-display:hover {
			box-shadow:
				0 var(--space-1) var(--space-2) color-mix(in srgb, var(--ink) 8%, transparent),
				0 var(--space-2) var(--space-4) color-mix(in srgb, var(--ink) 10%, transparent),
				inset 0 1px 0 var(--surface),
				inset 0 -1px 0 color-mix(in srgb, var(--ink) 5%, transparent);
		}
	}

	@media (hover: hover) and (prefers-reduced-motion: no-preference) {
		.session-display:hover {
			transform: translateY(-1px);
		}
	}

	.session-display:active {
		background: var(--surface);
		/* Match SessionNameSheet `.control:focus-visible` outline. */
		outline: 2px solid var(--ink);
		outline-offset: 2px;
		box-shadow:
			0 1px 0 color-mix(in srgb, var(--ink) 8%, transparent),
			inset 0 1px var(--space-1) color-mix(in srgb, var(--ink) 10%, transparent),
			inset 0 -1px 0 color-mix(in srgb, var(--surface) 60%, transparent);
		transform: none;
	}

	.session-display:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
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

	.error-detail,
	.limit-meta {
		display: block;
		margin-top: var(--space-2);
		color: var(--ink-muted);
		font-size: var(--text-meta);
	}

	.limit-list {
		margin: var(--space-2) 0 0;
		padding-left: var(--space-4);
		text-align: left;
		color: var(--ink-muted);
		font-size: var(--text-meta);
	}

	.capture-alerts :global(.ss-ghost-button) {
		margin-top: var(--space-3);
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

	@media (max-width: 360px) {
		.lower {
			padding-inline: var(--space-3);
			gap: var(--space-3);
		}

		/* Free horizontal room so Settings / Collection stay at --touch-min beside Record. */
		.record-side {
			padding-right: var(--space-2);
		}

		.record-side-end {
			padding-left: var(--space-2);
		}

		.wave-corners {
			inset-inline: var(--space-4);
		}

		.session-display {
			padding-inline: var(--space-4);
			font-size: var(--text-body);
		}
	}

	@media (min-width: 900px) {
		.capture {
			padding-top: var(--space-5);
		}

		.meters-header,
		.lower {
			padding-inline: var(--space-5);
		}

		.wave-corners {
			inset-inline: var(--space-7);
		}
	}
</style>
