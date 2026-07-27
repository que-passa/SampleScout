<script lang="ts">
	import { onMount } from 'svelte';
	import { listSessions, listTakesForSession, getTake } from '$lib/persistence';
	import {
		batchSaveTakeMetadata,
		discardLocalDraft,
		discardLocalDrafts,
		importAudioFiles,
		actionToast,
		onTakeInventoryChanged,
		openAccountOverlay,
		retryTakeUpload,
		enqueueBatchTakeUploads,
		cancelTakeUpload,
		uploadQueue,
		audiotoolAuth
	} from '$lib/state';
	import {
		assignNumberedDisplayNames,
		deriveCatalogReference,
		deriveSpecimenMark,
		isActiveTakeUploadState,
		isUploadPendingTake,
		isTakeSavedLocally,
		stemFromSessionName,
		validateTakeForUpload,
		type TakeMetadataPatch
	} from '$lib/domain';
	import type { CaptureSession, Take, TakeId } from '$lib/domain/types';
	import BatchFieldNotesPanel from '$lib/ui/components/BatchFieldNotesPanel.svelte';
	import BatchUploadPanel from '$lib/ui/components/BatchUploadPanel.svelte';
	import ConfirmDialog from '$lib/ui/components/ConfirmDialog.svelte';
	import EmptyState from '$lib/ui/components/EmptyState.svelte';
	import GhostButton from '$lib/ui/components/GhostButton.svelte';
	import PrimaryButton from '$lib/ui/components/PrimaryButton.svelte';
	import SheetOverlay from '$lib/ui/components/SheetOverlay.svelte';
	import TakeRow from '$lib/ui/components/TakeRow.svelte';
	import AppShell from '$lib/ui/layouts/AppShell.svelte';
	import { Icon } from '$lib/ui/icons';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';

	interface SessionWithTakes {
		session: CaptureSession;
		takes: Take[];
	}

	let sessions = $state<SessionWithTakes[]>([]);
	let loading = $state(true);
	let loadError = $state<string | null>(null);
	let importing = $state(false);
	let importStatus = $state<string | null>(null);
	let importError = $state<string | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);
	let selectMode = $state(false);
	let selectedIds = $state<Record<string, true>>({});
	let editDataOpen = $state(false);
	let batchBusy = $state(false);
	let batchStatus = $state<string | null>(null);
	let batchError = $state<string | null>(null);
	let uploading = $state(false);
	let discardConfirm = $state<
		| { kind: 'single'; takeId: string; displayName: string }
		| { kind: 'batch'; takeIds: string[]; count: number }
		| null
	>(null);
	let discarding = $state(false);
	let retryingTakeId = $state<string | null>(null);
	let uploadSheetOpen = $state(false);
	let uploadMarkedIds = $state<string[]>([]);
	let uploadPhase = $state<'confirm' | 'progress'>('confirm');

	const selectedCount = $derived(Object.keys(selectedIds).length);
	const allTakes = $derived(sessions.flatMap((entry) => entry.takes));
	const allTakeIds = $derived(allTakes.map((take) => take.id));
	const pendingUploadTakes = $derived(allTakes.filter((t) => isUploadPendingTake(t, allTakes)));
	const selectedTakes = $derived(allTakes.filter((take) => selectedIds[take.id]));
	const selectedPendingUploadTakes = $derived(
		selectedTakes.filter((t) => isUploadPendingTake(t, allTakes))
	);
	const selectionActionsEnabled = $derived(
		selectedCount > 0 && !batchBusy && !discarding && !uploading
	);

	// Upload sheet derived values
	const uploadTakes = $derived(allTakes.filter((take) => uploadMarkedIds.includes(take.id)));
	const progressActive = $derived(uploadPhase === 'progress');

	// Get initial values for upload form
	const uploadInitialStem = $derived.by(() => {
		if (uploadTakes.length === 0) return '';
		const firstTake = uploadTakes[0];
		const session = sessions.find((s) => s.takes.some((t) => t.id === firstTake.id))?.session;
		return session ? stemFromSessionName(session.name) : '';
	});

	const uploadInitialDescription = $derived(
		uploadTakes.length > 0 ? uploadTakes[0].metadata.description || '' : ''
	);
	const uploadInitialTags = $derived(
		uploadTakes.length > 0 ? uploadTakes[0].metadata.tags.join(', ') : ''
	);

	// Progress tracking
	const uploadProgress = $derived.by(() => {
		if (uploadPhase !== 'progress') return { current: null, index: 0, total: 0, fraction: null };

		let settled = 0;
		let current: Take | null = null;
		let currentFraction: number | null = null;

		for (const takeId of uploadMarkedIds) {
			const job = uploadQueue.byTakeId[takeId];
			if (!job) continue;
			if (job.state === 'completed' || job.state === 'failed' || job.state === 'canceled') {
				settled++;
				continue;
			}
			if (!current) {
				current = allTakes.find((t) => t.id === takeId) ?? null;
				currentFraction = job.progress?.fraction ?? null;
			}
		}

		return {
			current: current?.metadata.displayName ?? null,
			index: Math.min(settled + 1, uploadMarkedIds.length),
			total: uploadMarkedIds.length,
			fraction: currentFraction
		};
	});

	async function load() {
		const allSessions = await listSessions();
		const sessionsWithTakes: SessionWithTakes[] = [];

		for (const session of allSessions) {
			const takes = await listTakesForSession(session.id);
			if (takes.length > 0) {
				sessionsWithTakes.push({
					session,
					takes: [...takes].sort((a, b) => b.sequence - a.sequence)
				});
			}
		}

		sessionsWithTakes.sort((a, b) => {
			const aTime = a.takes[0]?.updatedAt || a.session.updatedAt;
			const bTime = b.takes[0]?.updatedAt || b.session.updatedAt;
			return bTime.localeCompare(aTime);
		});

		sessions = sessionsWithTakes;
		loadError = null;

		const visible = new Set(sessionsWithTakes.flatMap((entry) => entry.takes.map((t) => t.id)));
		const nextSelected: Record<string, true> = {};
		for (const id of Object.keys(selectedIds)) {
			if (visible.has(id)) nextSelected[id] = true;
		}
		selectedIds = nextSelected;
		if (Object.keys(nextSelected).length === 0) editDataOpen = false;
		if (sessionsWithTakes.length === 0) {
			selectMode = false;
			editDataOpen = false;
		}
	}

	async function retryLoad() {
		loading = true;
		loadError = null;
		try {
			await load();
		} catch (error) {
			loadError =
				error && typeof error === 'object' && 'message' in error
					? String((error as { message: string }).message)
					: 'Could not load Collection.';
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		const unsubInventory = onTakeInventoryChanged(() => {
			void load().catch((error) => {
				console.error('Failed to refresh Collection:', error);
			});
		});
		void (async () => {
			try {
				await load();
			} catch (error) {
				console.error('Failed to load sessions:', error);
				loadError =
					error && typeof error === 'object' && 'message' in error
						? String((error as { message: string }).message)
						: 'Could not load Collection.';
			} finally {
				loading = false;
			}
		})();
		return unsubInventory;
	});

	// Track upload completion
	$effect(() => {
		if (uploadPhase !== 'progress' || uploadMarkedIds.length === 0) return;

		const marked = [...uploadMarkedIds];
		const allSettled = marked.every((takeId) => {
			const job = uploadQueue.byTakeId[takeId];
			return job?.state === 'completed' || job?.state === 'failed' || job?.state === 'canceled';
		});

		if (!allSettled) return;

		const completed = marked.filter(
			(takeId) => uploadQueue.byTakeId[takeId]?.state === 'completed'
		).length;

		actionToast.show(completed === 1 ? 'Upload completed' : `${completed} uploads completed`);
		uploadSheetOpen = false;
		uploadMarkedIds = [];
		uploadPhase = 'confirm';

		if (selectMode && marked.some((id) => selectedIds[id])) {
			selectedIds = {};
			editDataOpen = false;
		}

		void load();
	});

	function requestDiscard(takeId: string, displayName: string) {
		discardConfirm = {
			kind: 'single',
			takeId,
			displayName: displayName.trim() || 'this Local Draft'
		};
	}

	function requestBatchDiscard() {
		const takeIds = Object.keys(selectedIds);
		if (takeIds.length === 0 || batchBusy || discarding) return;
		discardConfirm = { kind: 'batch', takeIds, count: takeIds.length };
	}

	function cancelDiscard() {
		if (discarding) return;
		discardConfirm = null;
	}

	async function confirmDiscard() {
		const pending = discardConfirm;
		if (!pending || discarding) return;
		discarding = true;
		try {
			if (pending.kind === 'single') {
				await discardLocalDraft(pending.takeId);
			} else {
				batchBusy = true;
				batchError = null;
				batchStatus = `Discarding ${pending.count} Local Draft${pending.count === 1 ? '' : 's'}…`;
				const result = await discardLocalDrafts(pending.takeIds);
				const ok = result.discarded.length;
				const fail = result.errors.length;
				if (ok > 0 && fail === 0) {
					batchStatus = `Discarded ${ok} Local Draft${ok === 1 ? '' : 's'}.`;
					selectedIds = {};
					editDataOpen = false;
				} else if (ok > 0 && fail > 0) {
					batchStatus = `Discarded ${ok}; ${fail} failed.`;
					batchError = result.errors.map((error) => error.message).join(' ');
					const failed = new Set(result.errors.map((error) => error.takeId));
					const next: Record<string, true> = {};
					for (const id of pending.takeIds) {
						if (failed.has(id)) next[id] = true;
					}
					selectedIds = next;
				} else {
					batchStatus = null;
					batchError = result.errors.map((error) => error.message).join(' ') || 'Discard failed.';
				}
			}
			discardConfirm = null;
		} catch (cause) {
			if (pending.kind === 'batch') {
				batchStatus = null;
				batchError =
					cause && typeof cause === 'object' && 'message' in cause
						? String((cause as { message: string }).message)
						: 'Discard failed.';
			}
		} finally {
			discarding = false;
			batchBusy = false;
		}
	}

	async function onRetryUpload(takeId: TakeId) {
		if (retryingTakeId) return;
		if (audiotoolAuth.status.state !== 'connected') {
			openAccountOverlay();
			return;
		}
		retryingTakeId = takeId;
		batchError = null;
		try {
			await retryTakeUpload(takeId);
			await load();
		} catch (cause) {
			batchError =
				cause && typeof cause === 'object' && 'message' in cause
					? String((cause as { message: string }).message)
					: 'Could not retry upload.';
		} finally {
			retryingTakeId = null;
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

	function toggleSelectMode() {
		selectMode = !selectMode;
		if (!selectMode) {
			selectedIds = {};
			editDataOpen = false;
			batchStatus = null;
			batchError = null;
		}
	}

	function setSelected(takeId: TakeId, selected: boolean) {
		const next = { ...selectedIds };
		if (selected) next[takeId] = true;
		else delete next[takeId];
		selectedIds = next;
		if (Object.keys(next).length === 0) editDataOpen = false;
	}

	function selectAllVisible() {
		const next: Record<string, true> = {};
		for (const id of allTakeIds) next[id] = true;
		selectedIds = next;
	}

	function clearSelection() {
		selectedIds = {};
		editDataOpen = false;
		batchStatus = null;
		batchError = null;
	}

	function openEditData() {
		if (!selectionActionsEnabled) return;
		batchStatus = null;
		batchError = null;
		editDataOpen = true;
	}

	function closeEditData() {
		if (batchBusy) return;
		editDataOpen = false;
	}

	function uploadAllPending() {
		if (uploading || batchBusy || discarding) return;
		if (pendingUploadTakes.length === 0) {
			batchError = 'Nothing to upload — Collection has no pending Local Drafts.';
			return;
		}
		uploadMarkedIds = pendingUploadTakes.map((t) => t.id);
		uploadPhase = 'confirm';
		uploadSheetOpen = true;
	}

	function uploadSelected() {
		if (!selectionActionsEnabled) return;
		if (selectedPendingUploadTakes.length === 0) {
			batchError = 'Nothing to upload — selected takes are already uploaded or not saved locally.';
			return;
		}
		uploadMarkedIds = selectedPendingUploadTakes.map((t) => t.id);
		uploadPhase = 'confirm';
		uploadSheetOpen = true;
	}

	async function onUploadConfirm(overlay: {
		titleStem: string;
		description: string;
		tags: string[];
	}) {
		if (audiotoolAuth.status.state !== 'connected') {
			openAccountOverlay();
			return;
		}

		uploading = true;
		batchError = null;

		try {
			const takesToUpdate = uploadTakes.filter((t) => isUploadPendingTake(t, allTakes));

			if (takesToUpdate.length > 0) {
				const numberedNames = assignNumberedDisplayNames(overlay.titleStem, takesToUpdate.length);

				for (let i = 0; i < takesToUpdate.length; i++) {
					const take = takesToUpdate[i];
					if (!take) continue;
					const patch: TakeMetadataPatch = {
						displayName: numberedNames[i],
						...(overlay.description ? { description: overlay.description } : {}),
						...(overlay.tags.length > 0 ? { tags: overlay.tags } : {})
					};

					await batchSaveTakeMetadata([take.id], patch);
				}
			}

			const takeIdsToUpload: TakeId[] = [];
			for (const takeId of uploadMarkedIds) {
				const take = await getTake(takeId);
				if (!take) continue;
				if (isActiveTakeUploadState(take.uploadState)) continue;
				const validation = validateTakeForUpload(take);
				if (validation) continue;
				takeIdsToUpload.push(takeId);
			}

			if (takeIdsToUpload.length === 0) {
				batchError = 'Could not queue uploads.';
				return;
			}

			try {
				await enqueueBatchTakeUploads(takeIdsToUpload);
			} catch (cause) {
				console.error('Failed to enqueue uploads:', cause);
				batchError = 'Could not queue uploads.';
				return;
			}

			uploadPhase = 'progress';
			void load();
		} catch (cause) {
			batchError =
				cause && typeof cause === 'object' && 'message' in cause
					? String((cause as { message: string }).message)
					: 'Could not start upload.';
		} finally {
			uploading = false;
		}
	}

	function onUploadCancel() {
		if (uploadPhase === 'progress') {
			// Cancel active uploads
			for (const takeId of uploadMarkedIds) {
				void cancelTakeUpload(takeId).catch(console.error);
			}
		}

		uploadSheetOpen = false;
		uploadMarkedIds = [];
		uploadPhase = 'confirm';
	}

	function onUploadRemove(takeId: string) {
		uploadMarkedIds = uploadMarkedIds.filter((id) => id !== takeId);
		if (uploadMarkedIds.length === 0) {
			uploadSheetOpen = false;
		}
	}

	async function onBatchApply(patch: TakeMetadataPatch) {
		const ids = Object.keys(selectedIds);
		if (ids.length === 0) return;
		batchBusy = true;
		batchError = null;
		batchStatus = `Updating ${ids.length} take${ids.length === 1 ? '' : 's'}…`;
		try {
			const result = await batchSaveTakeMetadata(ids, patch);
			const ok = result.updated.length;
			const fail = result.errors.length;
			if (ok > 0 && fail === 0) {
				batchStatus = null;
				actionToast.show(ok === 1 ? 'Field Notes updated' : `Field Notes updated on ${ok} takes`);
				editDataOpen = false;
			} else if (ok > 0 && fail > 0) {
				batchStatus = `Updated ${ok}; ${fail} failed.`;
				batchError = result.errors.map((error) => error.message).join(' ');
			} else {
				batchStatus = null;
				batchError =
					result.errors.map((error) => error.message).join(' ') ||
					'Batch Field Notes update failed.';
			}
		} catch (cause) {
			batchStatus = null;
			batchError =
				cause && typeof cause === 'object' && 'message' in cause
					? String((cause as { message: string }).message)
					: 'Batch Field Notes update failed.';
		} finally {
			batchBusy = false;
		}
	}
</script>

<svelte:head>
	<title>Collection · SampleScout</title>
</svelte:head>

<AppShell>
	<section class="drafts">
		<div class="drafts-scroll">
			{#if importStatus}
				<p class="status-line" role="status">{importStatus}</p>
			{/if}
			{#if importError}
				<p class="error-line" role="alert">{importError}</p>
			{/if}

			{#if batchStatus}
				<p class="status-line" role="status">{batchStatus}</p>
			{/if}
			{#if batchError}
				<p class="error-line" role="alert">{batchError}</p>
			{/if}

			{#if loading}
				<p class="loading">Loading Collection and Field Sessions…</p>
			{:else if loadError}
				<EmptyState
					title="Could not load Collection"
					body={loadError}
					actionLabel="Retry"
					onaction={() => {
						void retryLoad();
					}}
				/>
			{:else if sessions.length === 0}
				<EmptyState
					title="Collection is empty"
					body="Capture a take or import an audio file to create a Local Draft. Saved takes are grouped into Field Sessions on this device for review, discard, and upload."
					actionLabel="Go to Capture"
					onaction={() => {
						void goto(resolve('/capture'));
					}}
					secondaryActionLabel="Import"
					onsecondaryaction={openImportPicker}
				/>
			{:else}
				<div class="sessions-list">
					{#each sessions as { session, takes } (session.id)}
						<section class="session-block">
							<header class="session-header">
								<h2 class="session-name">{session.name}</h2>
								<p class="session-meta">
									{takes.length} take{takes.length === 1 ? '' : 's'}
								</p>
							</header>
							<div class="takes">
								{#each takes as take (take.id)}
									<TakeRow
										name={take.metadata.displayName}
										savedLocally={isTakeSavedLocally(take)}
										catalogReference={deriveCatalogReference(take)}
										specimenMark={deriveSpecimenMark(take)}
										uploadState={take.uploadState === 'not-queued' ? undefined : take.uploadState}
										takeId={take.id}
										selectable={selectMode}
										selected={Boolean(selectedIds[take.id])}
										onselect={(selected) => setSelected(take.id, selected)}
										ondiscard={selectMode
											? undefined
											: () => requestDiscard(take.id, take.metadata.displayName)}
										onretry={!selectMode && take.uploadState === 'failed'
											? () => void onRetryUpload(take.id)
											: undefined}
										retryBusy={retryingTakeId === take.id}
									/>
								{/each}
							</div>
						</section>
					{/each}
				</div>
			{/if}

			<p class="lead">
				Local Drafts stay on this device only. There is no cloud backup or cross-device sync, and
				clearing site data removes them.
			</p>
		</div>

		<div class="bottom-chrome">
			{#if selectMode && sessions.length > 0}
				<div class="select-bar" aria-label="Selection">
					<GhostButton compact onclick={selectAllVisible}>Select all</GhostButton>
					<p class="select-count">{selectedCount} selected</p>
				</div>
			{/if}

			<footer class="actions-bar" aria-label="Collection actions">
				{#if sessions.length > 0}
					<GhostButton onclick={toggleSelectMode} disabled={uploading || discarding}>
						{selectMode ? 'Done' : 'Select'}
					</GhostButton>
				{/if}
				{#if selectMode && sessions.length > 0}
					<div class="action-group">
						<GhostButton
							icon
							disabled={!selectionActionsEnabled}
							onclick={openEditData}
							aria-label="Field Notes"
						>
							<Icon name="field-notes" />
						</GhostButton>
						<GhostButton
							icon
							danger
							disabled={!selectionActionsEnabled}
							onclick={requestBatchDiscard}
							aria-label="Discard"
						>
							<Icon name="trash" />
						</GhostButton>
						<PrimaryButton
							disabled={!selectionActionsEnabled || selectedPendingUploadTakes.length === 0}
							onclick={uploadSelected}
						>
							Upload
						</PrimaryButton>
					</div>
				{:else}
					<GhostButton onclick={openImportPicker} disabled={importing || uploading}>
						Import
					</GhostButton>
					{#if sessions.length > 0}
						<PrimaryButton
							onclick={uploadAllPending}
							disabled={uploading || importing || pendingUploadTakes.length === 0}
						>
							Upload
						</PrimaryButton>
					{/if}
				{/if}
				<input
					{@attach bindFileInput}
					type="file"
					accept="audio/*"
					multiple
					class="file-input"
					onchange={(event) => void onImportFiles(event)}
				/>
			</footer>
		</div>
	</section>

	{#if editDataOpen}
		<SheetOverlay title="Edit data" dismissible={!batchBusy} onclose={closeEditData}>
			<BatchFieldNotesPanel
				{selectedCount}
				busy={batchBusy || discarding}
				embedded
				onapply={onBatchApply}
				onclear={() => {
					clearSelection();
				}}
			/>
		</SheetOverlay>
	{/if}

	{#if uploadSheetOpen}
		<SheetOverlay
			title="Upload"
			dismissible={!progressActive}
			onclose={() => {
				if (!progressActive) {
					uploadSheetOpen = false;
					uploadMarkedIds = [];
					uploadPhase = 'confirm';
				}
			}}
		>
			<BatchUploadPanel
				embedded
				takes={uploadTakes}
				busy={uploading}
				{progressActive}
				progressLabel={uploadProgress.current
					? `Uploading ${uploadProgress.current}`
					: 'Uploading...'}
				progressFraction={uploadProgress.fraction}
				progressCurrent={uploadProgress.current}
				progressIndex={uploadProgress.index}
				progressTotal={uploadProgress.total}
				initialStem={uploadInitialStem}
				initialDescription={uploadInitialDescription}
				initialTags={uploadInitialTags}
				oncancel={onUploadCancel}
				onconfirm={onUploadConfirm}
				onremove={onUploadRemove}
			/>
		</SheetOverlay>
	{/if}

	{#if discardConfirm}
		<ConfirmDialog
			title="Discard"
			message={discardConfirm.kind === 'single'
				? `Discard “${discardConfirm.displayName}”? It will be removed from this device.`
				: `Discard ${discardConfirm.count} Local Draft${discardConfirm.count === 1 ? '' : 's'}? They will be removed from this device.`}
			confirmLabel="Discard"
			busy={discarding}
			oncancel={cancelDiscard}
			onconfirm={() => void confirmDiscard()}
		/>
	{/if}
</AppShell>

<style>
	.drafts {
		height: 100%;
		min-height: 0;
		display: grid;
		grid-template-rows: 1fr auto;
		overflow: hidden;
	}

	.drafts-scroll {
		min-height: 0;
		overflow: auto;
		display: grid;
		align-content: start;
		gap: var(--space-4);
		padding: var(--space-2) var(--page-gutter) var(--space-4);
	}

	.bottom-chrome {
		border-top: 1px solid var(--line);
		background: var(--paper);
		z-index: 1;
	}

	.actions-bar {
		display: flex;
		align-items: center;
		justify-content: flex-start;
		gap: var(--space-3);
		padding: var(--space-2) var(--page-gutter);
		padding-bottom: calc(var(--space-2) + env(safe-area-inset-bottom, 0px));
	}

	.action-group {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}

	.actions-bar > :global(.ss-primary-button) {
		margin-left: auto;
	}

	.file-input {
		display: none;
	}

	.status-line {
		margin: 0;
		font-size: var(--text-meta);
		color: var(--ink-muted);
	}

	.error-line {
		margin: 0;
		font-size: var(--text-meta);
		color: var(--signal);
	}

	.select-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-1) var(--page-gutter);
		border-bottom: 1px solid var(--line);
	}

	.select-count {
		margin: 0;
		font-size: var(--text-label);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--ink-muted);
		flex-shrink: 0;
	}

	.loading {
		color: var(--ink-muted);
	}

	.sessions-list {
		display: grid;
		gap: var(--space-5);
	}

	.session-block {
		display: grid;
		gap: var(--space-3);
	}

	.session-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}

	.session-name {
		margin: 0;
		font-size: var(--text-screen);
		font-weight: 600;
	}

	.session-meta {
		margin: 0;
		font-size: var(--text-meta);
		color: var(--ink-muted);
		font-weight: 600;
		flex-shrink: 0;
	}

	.takes {
		display: grid;
		gap: var(--space-3);
	}

	.lead {
		margin: 0;
		max-width: 40rem;
		font-size: var(--text-meta);
		color: var(--ink-muted);
	}

	@media (min-width: 900px) {
		.drafts-scroll {
			padding-top: var(--space-3);
			padding-bottom: var(--space-5);
		}
	}
</style>
