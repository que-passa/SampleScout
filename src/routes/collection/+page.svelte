<script lang="ts">
	import { onMount } from 'svelte';
	import { listSessions, listTakesForSession, getTake } from '$lib/persistence';
	import {
		batchSaveTakeMetadata,
		discardLocalFile,
		discardLocalFiles,
		importAudioFiles,
		actionToast,
		onTakeInventoryChanged,
		openAccountOverlay,
		retryTakeUpload,
		saveTakeOutput,
		enqueueBatchTakeUploads,
		cancelTakeUpload,
		uploadQueue,
		audiotoolAuth,
		onGeneratedTagsApplied,
		scheduleGeneratedTagsForTakes
	} from '$lib/state';
	import {
		assignNumberedDisplayNames,
		deriveCatalogReference,
		deriveSpecimenMark,
		collectionLineageGlyph,
		formatShortDate,
		formatShortDateTime,
		formatTakeDurationSeconds,
		isActiveTakeUploadState,
		isUploadPendingTake,
		isTakeSavedLocally,
		recipeDurationSeconds,
		stemFromSessionName,
		validateTakeForUpload,
		type TakeMetadataPatch
	} from '$lib/domain';
	import type { CaptureSession, OutputSettings, Take, TakeId } from '$lib/domain/types';
	import { DEFAULT_UPLOAD_OUTPUT, normalizeUploadOutput } from '$lib/config/upload-output';
	import { getAppSettings, rememberRecentTagsFromUse } from '$lib/persistence';
	import BatchFieldNotesPanel from '$lib/ui/components/BatchFieldNotesPanel.svelte';
	import BatchUploadPanel from '$lib/ui/components/BatchUploadPanel.svelte';
	import ConfirmDialog from '$lib/ui/components/ConfirmDialog.svelte';
	import EmptyState from '$lib/ui/components/EmptyState.svelte';
	import GhostButton from '$lib/ui/components/GhostButton.svelte';
	import PrimaryButton from '$lib/ui/components/PrimaryButton.svelte';
	import SheetOverlay from '$lib/ui/components/SheetOverlay.svelte';
	import StatusLabel from '$lib/ui/components/StatusLabel.svelte';
	import TakeRow from '$lib/ui/components/TakeRow.svelte';
	import AppShell from '$lib/ui/layouts/AppShell.svelte';
	import { Icon } from '$lib/ui/icons';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';

	interface SessionWithTakes {
		session: CaptureSession;
		takes: Take[];
	}

	const DEFAULT_UPLOAD_OUTPUT_FALLBACK = DEFAULT_UPLOAD_OUTPUT;

	let preferredUploadOutput = $state(normalizeUploadOutput(DEFAULT_UPLOAD_OUTPUT_FALLBACK));
	let recentTags = $state<string[]>([]);

	function outputSettingsEqual(a: OutputSettings, b: OutputSettings): boolean {
		if (a.format !== b.format) return false;
		if (a.format === 'wav' && b.format === 'wav') return a.bitDepth === b.bitDepth;
		if (a.format === 'mp3' && b.format === 'mp3') return a.bitrateKbps === b.bitrateKbps;
		return a.format === 'source' && b.format === 'source';
	}

	function sharedUploadOutput(
		takes: Take[]
	): Extract<OutputSettings, { format: 'wav' | 'mp3' }> | null {
		const first = takes[0]?.output;
		if (!first || first.format === 'source') return null;
		return takes.every((take) => outputSettingsEqual(take.output, first)) ? first : null;
	}

	let sessions = $state<SessionWithTakes[]>([]);
	let loading = $state(true);
	let loadError = $state<string | null>(null);
	let importing = $state(false);
	let fileInput = $state<HTMLInputElement | null>(null);
	let selectMode = $state(false);
	let selectedIds = $state<Record<string, true>>({});
	let editDataOpen = $state(false);
	let batchBusy = $state(false);
	let uploading = $state(false);
	let discardConfirm = $state<
		| { kind: 'single'; takeId: string; displayName: string }
		| { kind: 'batch'; takeIds: string[]; count: number }
		| { kind: 'cleanup'; takeIds: string[]; count: number }
		| null
	>(null);
	let discarding = $state(false);
	let retryingTakeId = $state<string | null>(null);
	let uploadSheetOpen = $state(false);
	let uploadMarkedIds = $state<string[]>([]);
	let uploadPhase = $state<'confirm' | 'progress'>('confirm');
	let uploadSettleHandled = $state(false);
	let batchFieldNotesCanApply = $state(false);
	let uploadCanConfirm = $state(false);

	const selectedCount = $derived(Object.keys(selectedIds).length);
	const allTakes = $derived(sessions.flatMap((entry) => entry.takes));
	const allTakeIds = $derived(allTakes.map((take) => take.id));
	const collectionHasTakes = $derived(sessions.length > 0);
	const pendingUploadTakes = $derived(allTakes.filter((t) => isUploadPendingTake(t, allTakes)));
	const uploadedTakes = $derived(allTakes.filter((t) => t.uploadState === 'uploaded'));
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
	const uploadAllSettled = $derived.by(() => {
		if (uploadPhase !== 'progress' || uploadMarkedIds.length === 0) return false;
		return uploadMarkedIds.every((takeId) => {
			const job = uploadQueue.byTakeId[takeId];
			return job?.state === 'completed' || job?.state === 'failed' || job?.state === 'canceled';
		});
	});
	function formatUploadErrorText(error: { code?: string; message?: string } | undefined): string {
		if (!error) return '';
		const message = error.message?.trim() ?? '';
		const code = error.code?.trim() ?? '';
		if (message && code && !message.includes(code)) return `${code}: ${message}`;
		return message || code;
	}

	const uploadFailureMessages = $derived.by(() => {
		if (uploadPhase !== 'progress') return [];
		const messages: { takeId: string; name: string; message: string }[] = [];
		for (const takeId of uploadMarkedIds) {
			const job = uploadQueue.byTakeId[takeId];
			const take = allTakes.find((t) => t.id === takeId);
			const message = formatUploadErrorText(job?.error ?? take?.lastError);
			if (job?.state === 'failed' && message) {
				messages.push({
					takeId,
					name: take?.metadata.displayName ?? takeId,
					message
				});
			}
		}
		return messages;
	});

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
		uploadTakes.length > 0 ? [...uploadTakes[0].metadata.tags] : []
	);
	const uploadInitialOutput = $derived.by(
		() => sharedUploadOutput(uploadTakes) ?? preferredUploadOutput
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

	const uploadProgressDismissLabel = $derived(
		uploadFailureMessages.length > 0 && !uploadProgress.current ? 'Close' : 'Cancel'
	);

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

		scheduleGeneratedTagsForTakes(sessionsWithTakes.flatMap((entry) => entry.takes));
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
		onGeneratedTagsApplied(() => {
			void load().catch((error) => {
				console.error('Failed to refresh Collection after tag generation:', error);
			});
		});
		void (async () => {
			try {
				const settings = await getAppSettings();
				preferredUploadOutput = normalizeUploadOutput(settings.preferredOutput);
				recentTags = settings.recentTags;
			} catch {
				preferredUploadOutput = normalizeUploadOutput(DEFAULT_UPLOAD_OUTPUT_FALLBACK);
				recentTags = [];
			}
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
		if (uploadPhase !== 'progress' || uploadMarkedIds.length === 0 || uploadSettleHandled) return;

		const marked = [...uploadMarkedIds];
		const allSettled = marked.every((takeId) => {
			const job = uploadQueue.byTakeId[takeId];
			return job?.state === 'completed' || job?.state === 'failed' || job?.state === 'canceled';
		});

		if (!allSettled) return;

		uploadSettleHandled = true;

		const completed = marked.filter(
			(takeId) => uploadQueue.byTakeId[takeId]?.state === 'completed'
		).length;
		const failedIds = marked.filter((takeId) => uploadQueue.byTakeId[takeId]?.state === 'failed');
		const firstFailure =
			failedIds
				.map((takeId) => {
					const job = uploadQueue.byTakeId[takeId];
					const take = allTakes.find((t) => t.id === takeId);
					return formatUploadErrorText(job?.error ?? take?.lastError);
				})
				.find((message) => message.trim().length > 0) ?? '';

		if (failedIds.length === 0) {
			actionToast.show(completed === 1 ? 'Upload completed' : `${completed} uploads completed`);
			uploadSheetOpen = false;
			uploadMarkedIds = [];
			uploadPhase = 'confirm';
			uploadSettleHandled = false;
		} else {
			// Keep sheet open so the real Audiotool/app error text can be screenshot.
			actionToast.show(
				failedIds.length === 1
					? firstFailure || 'Upload failed'
					: `${failedIds.length} uploads failed${firstFailure ? `: ${firstFailure}` : ''}`
			);
		}

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
			displayName: displayName.trim() || 'this Local File'
		};
	}

	function requestBatchDiscard() {
		const takeIds = Object.keys(selectedIds);
		if (takeIds.length === 0 || batchBusy || discarding) return;
		discardConfirm = { kind: 'batch', takeIds, count: takeIds.length };
	}

	function requestCleanup() {
		if (batchBusy || discarding || uploading || importing) return;
		if (uploadedTakes.length === 0) {
			actionToast.show('Nothing to clean up');
			return;
		}
		discardConfirm = {
			kind: 'cleanup',
			takeIds: uploadedTakes.map((take) => take.id),
			count: uploadedTakes.length
		};
	}

	function cancelDiscard() {
		if (discarding) return;
		discardConfirm = null;
	}

	function causeMessage(cause: unknown, fallback: string): string {
		return cause && typeof cause === 'object' && 'message' in cause
			? String((cause as { message: string }).message)
			: fallback;
	}

	async function confirmDiscard() {
		const pending = discardConfirm;
		if (!pending || discarding) return;
		discarding = true;
		try {
			if (pending.kind === 'single') {
				await discardLocalFile(pending.takeId);
			} else {
				batchBusy = true;
				const isCleanup = pending.kind === 'cleanup';
				const noun = isCleanup
					? `file${pending.count === 1 ? '' : 's'}`
					: `Local File${pending.count === 1 ? '' : 's'}`;
				actionToast.show(`${isCleanup ? 'Deleting' : 'Discarding'} ${pending.count} ${noun}…`);
				const result = await discardLocalFiles(pending.takeIds, { silent: true });
				const ok = result.discarded.length;
				const fail = result.errors.length;
				if (ok > 0 && fail === 0) {
					actionToast.show(
						isCleanup
							? `Deleted ${ok} local file${ok === 1 ? '' : 's'}`
							: ok === 1
								? '1 Local File discarded'
								: `${ok} Local Files discarded`
					);
					if (pending.kind === 'batch') {
						selectedIds = {};
						editDataOpen = false;
					}
				} else if (ok > 0 && fail > 0) {
					actionToast.show(`${isCleanup ? 'Deleted' : 'Discarded'} ${ok}; ${fail} failed`);
					if (pending.kind === 'batch') {
						const failed = new Set(result.errors.map((error) => error.takeId));
						const next: Record<string, true> = {};
						for (const id of pending.takeIds) {
							if (failed.has(id)) next[id] = true;
						}
						selectedIds = next;
					}
				} else {
					actionToast.show(
						result.errors[0]?.message || (isCleanup ? 'Cleanup failed' : 'Discard failed')
					);
				}
			}
			discardConfirm = null;
		} catch (cause) {
			if (pending.kind === 'batch' || pending.kind === 'cleanup') {
				actionToast.show(
					causeMessage(cause, pending.kind === 'cleanup' ? 'Cleanup failed' : 'Discard failed')
				);
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
		try {
			await retryTakeUpload(takeId);
			await load();
		} catch (cause) {
			actionToast.show(causeMessage(cause, 'Could not retry upload'));
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
			if (ok > 0 && fail === 0) {
				actionToast.show(`Imported ${ok} Local File${ok === 1 ? '' : 's'}`);
			} else if (ok > 0 && fail > 0) {
				actionToast.show(`Imported ${ok}; ${fail} failed`);
			} else {
				actionToast.show(result.errors[0]?.message || 'Import failed');
			}
		} catch (cause) {
			actionToast.show(causeMessage(cause, 'Import failed'));
		} finally {
			importing = false;
		}
	}

	function toggleSelectMode() {
		selectMode = !selectMode;
		if (!selectMode) {
			selectedIds = {};
			editDataOpen = false;
		}
	}

	function setSelected(takeId: TakeId, selected: boolean) {
		const next = { ...selectedIds };
		if (selected) next[takeId] = true;
		else delete next[takeId];
		selectedIds = next;
		if (Object.keys(next).length === 0) editDataOpen = false;
	}

	function isSessionFullySelected(takes: Take[]): boolean {
		return takes.length > 0 && takes.every((take) => Boolean(selectedIds[take.id]));
	}

	function toggleSessionSelection(takes: Take[]) {
		const next = { ...selectedIds };
		if (isSessionFullySelected(takes)) {
			for (const take of takes) delete next[take.id];
		} else {
			for (const take of takes) next[take.id] = true;
		}
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
	}

	function openEditData() {
		if (!selectionActionsEnabled) return;
		editDataOpen = true;
	}

	function closeEditData() {
		if (batchBusy) return;
		editDataOpen = false;
	}

	function uploadAllPending() {
		if (uploading || batchBusy || discarding) return;
		if (pendingUploadTakes.length === 0) {
			actionToast.show('Nothing to upload');
			return;
		}
		uploadMarkedIds = pendingUploadTakes.map((t) => t.id);
		uploadPhase = 'confirm';
		uploadSettleHandled = false;
		uploadSheetOpen = true;
	}

	function uploadSelected() {
		if (!selectionActionsEnabled) return;
		if (selectedPendingUploadTakes.length === 0) {
			actionToast.show('Selected takes cannot be uploaded');
			return;
		}
		uploadMarkedIds = selectedPendingUploadTakes.map((t) => t.id);
		uploadPhase = 'confirm';
		uploadSettleHandled = false;
		uploadSheetOpen = true;
	}

	async function onUploadConfirm(overlay: {
		titleStem: string;
		description: string;
		tags: string[];
		output: Extract<OutputSettings, { format: 'wav' | 'mp3' }>;
	}) {
		if (audiotoolAuth.status.state !== 'connected') {
			openAccountOverlay();
			return;
		}

		uploading = true;

		try {
			const takesToUpdate = uploadTakes.filter((t) => isUploadPendingTake(t, allTakes));

			if (takesToUpdate.length > 0) {
				const numberedNames = assignNumberedDisplayNames(overlay.titleStem, takesToUpdate.length);

				for (let i = 0; i < takesToUpdate.length; i++) {
					const take = takesToUpdate[i];
					if (!take) continue;
					if (!outputSettingsEqual(take.output, overlay.output)) {
						await saveTakeOutput(take.id, overlay.output);
					}
					const patch: TakeMetadataPatch = {
						displayName: numberedNames[i],
						...(overlay.description ? { description: overlay.description } : {}),
						...(overlay.tags.length > 0 ? { tags: overlay.tags } : {})
					};

					await batchSaveTakeMetadata([take.id], patch);
				}

				if (overlay.tags.length > 0) {
					void rememberRecentTagsFromUse(overlay.tags)
						.then((settings) => {
							recentTags = settings.recentTags;
						})
						.catch(() => {});
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
				actionToast.show('Could not queue uploads');
				return;
			}

			try {
				await enqueueBatchTakeUploads(takeIdsToUpload);
			} catch (cause) {
				console.error('Failed to enqueue uploads:', cause);
				actionToast.show('Could not queue uploads');
				return;
			}

			uploadPhase = 'progress';
			uploadSettleHandled = false;
			void load();
		} catch (cause) {
			actionToast.show(causeMessage(cause, 'Could not start upload'));
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
		uploadSettleHandled = false;
	}

	function onUploadRemove(takeId: string) {
		uploadMarkedIds = uploadMarkedIds.filter((id) => id !== takeId);
		if (uploadMarkedIds.length === 0) {
			uploadSheetOpen = false;
			uploadSettleHandled = false;
		}
	}

	async function onBatchApply(patch: TakeMetadataPatch) {
		const ids = Object.keys(selectedIds);
		if (ids.length === 0) return;
		batchBusy = true;
		actionToast.show(`Updating ${ids.length} take${ids.length === 1 ? '' : 's'}…`);
		try {
			const result = await batchSaveTakeMetadata(ids, patch);
			const ok = result.updated.length;
			const fail = result.errors.length;
			if (patch.tags) {
				void rememberRecentTagsFromUse(patch.tags)
					.then((settings) => {
						recentTags = settings.recentTags;
					})
					.catch(() => {});
			}
			if (ok > 0 && fail === 0) {
				actionToast.show(ok === 1 ? 'Field Notes updated' : `Field Notes updated on ${ok} takes`);
				editDataOpen = false;
			} else if (ok > 0 && fail > 0) {
				actionToast.show(`Updated ${ok}; ${fail} failed`);
			} else {
				actionToast.show(result.errors[0]?.message || 'Batch Field Notes update failed');
			}
		} catch (cause) {
			actionToast.show(causeMessage(cause, 'Batch Field Notes update failed'));
		} finally {
			batchBusy = false;
		}
	}
</script>

<svelte:head>
	<title>Collection · SampleScout</title>
</svelte:head>

<AppShell>
	<section class="collection">
		<div class="collection-scroll" class:is-empty={!loading && !loadError && sessions.length === 0}>
			{#if loading}
				<p class="loading">Loading…</p>
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
					align="center"
					framed={false}
					secondaryActionLabel="Import"
					onsecondaryaction={openImportPicker}
					actionLabel="Capture"
					onaction={() => {
						void goto(resolve('/capture'));
					}}
				/>
			{:else}
				<div class="sessions-list">
					{#each sessions as { session, takes } (session.id)}
						<section class="session-block">
							<header class="session-header" class:selectable={selectMode}>
								{#if selectMode}
									{@const sessionAllSelected = isSessionFullySelected(takes)}
									<div class="session-select-lead">
										<button
											type="button"
											class="session-select"
											aria-pressed={sessionAllSelected}
											aria-label={sessionAllSelected
												? `Deselect all in ${session.name}`
												: `Select all in ${session.name}`}
											onclick={() => toggleSessionSelection(takes)}
										></button>
										<span class="session-select-toggle" aria-hidden="true">
											<span class="session-select-mark" class:checked={sessionAllSelected}>
												{#if sessionAllSelected}
													<Icon name="check" size={12} />
												{/if}
											</span>
										</span>
										<h2 class="session-name">{session.name}</h2>
									</div>
								{:else}
									<h2 class="session-name">{session.name}</h2>
								{/if}
								<p class="session-meta">
									<span>{takes.length} file{takes.length === 1 ? '' : 's'}</span>
									<span>{formatShortDate(session.createdAt)}</span>
								</p>
							</header>
							{#each takes as take (take.id)}
								<TakeRow
									name={take.metadata.displayName}
									savedLocally={isTakeSavedLocally(take)}
									catalogReference={deriveCatalogReference(take)}
									durationLabel={formatTakeDurationSeconds(
										recipeDurationSeconds(take.editRecipe)
									)}
									lineageGlyph={collectionLineageGlyph(take, takes)}
									recordedAtLabel={formatShortDateTime(take.createdAt)}
									specimenMark={deriveSpecimenMark(take)}
									uploadState={take.uploadState === 'not-queued' ? undefined : take.uploadState}
									errorMessage={take.uploadState === 'failed'
										? formatUploadErrorText(
												take.lastError ?? uploadQueue.byTakeId[take.id]?.error
											) || undefined
										: undefined}
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
						</section>
					{/each}
				</div>

				<p class="lead">
					<StatusLabel tone="signal" density="compact">LOCAL</StatusLabel>
					<span class="lead-text">Not uploaded. Only on this device.</span>
				</p>
			{/if}
		</div>

		{#if collectionHasTakes}
			<div class="bottom-chrome">
				{#if selectMode}
					<div class="select-bar" aria-label="Selection">
						<div class="select-actions bar-cluster-tight">
							<GhostButton compact onclick={selectAllVisible}>Select all</GhostButton>
							<GhostButton compact disabled={selectedCount === 0} onclick={clearSelection}>
								Clear
							</GhostButton>
						</div>
						<p class="select-count">{selectedCount} selected</p>
					</div>
				{/if}

				<footer class="actions-bar bar-actions" aria-label="Collection actions">
					{#if selectMode}
						<GhostButton onclick={toggleSelectMode} disabled={uploading || discarding}>
							Done
						</GhostButton>
						<div class="action-group bar-cluster-tight">
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
						<div class="leading-actions bar-cluster-tight">
							<GhostButton onclick={toggleSelectMode} disabled={uploading || discarding}>
								Select
							</GhostButton>
							<GhostButton
								icon
								onclick={openImportPicker}
								disabled={importing || uploading || discarding}
								aria-label="Import"
							>
								<Icon name="import" />
							</GhostButton>
							<GhostButton
								icon
								onclick={requestCleanup}
								disabled={importing || uploading || discarding || batchBusy}
								aria-label="Cleanup"
							>
								<Icon name="cleanup" />
							</GhostButton>
						</div>
						<PrimaryButton
							onclick={uploadAllPending}
							disabled={uploading || importing || discarding || pendingUploadTakes.length === 0}
						>
							Upload
						</PrimaryButton>
					{/if}
				</footer>
			</div>
		{/if}

		<input
			{@attach bindFileInput}
			type="file"
			accept="audio/*"
			multiple
			class="file-input"
			onchange={(event) => void onImportFiles(event)}
		/>
	</section>

	{#if editDataOpen}
		<SheetOverlay title="Field Notes" dismissible={!batchBusy} onclose={closeEditData}>
			{#snippet footer()}
				<GhostButton disabled={batchBusy || discarding} onclick={clearSelection}>Clear</GhostButton>
				<PrimaryButton
					type="submit"
					form="collection-batch-field-notes-form"
					disabled={!batchFieldNotesCanApply || batchBusy || discarding}
				>
					{batchBusy ? 'Applying…' : 'Apply'}
				</PrimaryButton>
			{/snippet}
			<BatchFieldNotesPanel
				formId="collection-batch-field-notes-form"
				bind:canApply={batchFieldNotesCanApply}
				{selectedCount}
				{recentTags}
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
			dismissible={!progressActive || uploadAllSettled}
			onclose={() => {
				if (!progressActive || uploadAllSettled) {
					uploadSheetOpen = false;
					uploadMarkedIds = [];
					uploadPhase = 'confirm';
					uploadSettleHandled = false;
				}
			}}
		>
			{#snippet footer()}
				{#if progressActive}
					<span aria-hidden="true"></span>
					<GhostButton onclick={onUploadCancel}>{uploadProgressDismissLabel}</GhostButton>
				{:else}
					<GhostButton onclick={onUploadCancel} disabled={uploading}>Cancel</GhostButton>
					<PrimaryButton
						type="submit"
						form="collection-upload-form"
						disabled={!uploadCanConfirm || uploading}
					>
						{uploading ? 'Uploading…' : 'Upload'}
					</PrimaryButton>
				{/if}
			{/snippet}
			<BatchUploadPanel
				formId="collection-upload-form"
				bind:canConfirm={uploadCanConfirm}
				embedded
				takes={uploadTakes}
				busy={uploading}
				{progressActive}
				progressLabel={uploadAllSettled
					? uploadFailureMessages.length > 0
						? 'Finished with failures'
						: 'Upload complete'
					: uploadProgress.current
						? `Uploading ${uploadProgress.current}`
						: 'Uploading...'}
				progressFraction={uploadProgress.fraction}
				progressCurrent={uploadProgress.current}
				progressIndex={uploadProgress.index}
				progressTotal={uploadProgress.total}
				failureMessages={uploadFailureMessages}
				initialStem={uploadInitialStem}
				initialDescription={uploadInitialDescription}
				initialTags={uploadInitialTags}
				initialOutput={uploadInitialOutput}
				{recentTags}
				oncancel={onUploadCancel}
				onconfirm={onUploadConfirm}
				onremove={onUploadRemove}
			/>
		</SheetOverlay>
	{/if}

	{#if discardConfirm}
		<ConfirmDialog
			title={discardConfirm.kind === 'cleanup' ? 'Cleanup' : 'Discard'}
			message={discardConfirm.kind === 'single'
				? `Discard “${discardConfirm.displayName}”?`
				: discardConfirm.kind === 'cleanup'
					? `Delete ${discardConfirm.count} uploaded audio file${discardConfirm.count === 1 ? '' : 's'} from this device? Local files are removed permanently. Copies on Audiotool stay.`
					: `Discard ${discardConfirm.count} Local File${discardConfirm.count === 1 ? '' : 's'}?`}
			confirmLabel={discardConfirm.kind === 'cleanup' ? 'Delete files' : 'Discard'}
			busy={discarding}
			oncancel={cancelDiscard}
			onconfirm={() => void confirmDiscard()}
		/>
	{/if}
</AppShell>

<style>
	.collection {
		height: 100%;
		min-height: 0;
		display: grid;
		grid-template-rows: 1fr auto;
		overflow: hidden;
	}

	.collection-scroll {
		min-height: 0;
		overflow: auto;
		display: grid;
		align-content: start;
		gap: var(--space-4);
		padding: var(--space-2) var(--page-gutter) var(--space-4);
	}

	.collection-scroll.is-empty {
		align-content: center;
		justify-items: center;
	}

	.bottom-chrome {
		border-top: 1px solid var(--line);
		background: var(--paper);
		z-index: 1;
	}

	.actions-bar {
		/* Bottom inset comes from body safe-area padding — do not double it here. */
		padding: var(--space-2) var(--page-gutter);
	}

	.action-group {
		margin-left: auto;
	}

	.actions-bar > :global(.ss-primary-button) {
		margin-left: auto;
	}

	.file-input {
		display: none;
	}

	.select-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-1) var(--page-gutter);
		border-bottom: 1px solid var(--line);
	}

	@media (max-width: 360px) {
		.collection-scroll {
			padding-inline: var(--space-2);
		}

		.select-bar,
		.actions-bar {
			padding-inline: var(--space-2);
			gap: var(--space-2);
		}

		.session-header {
			gap: var(--space-2);
		}
	}

	.select-actions {
		flex-shrink: 0;
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
		padding-block: var(--space-1);
	}

	.session-header.selectable {
		gap: var(--space-2);
	}

	.session-select-lead {
		position: relative;
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
		flex: 1;
		padding-left: var(--space-1);
	}

	.session-select {
		position: absolute;
		inset: 0;
		z-index: 0;
		margin: 0;
		padding: 0;
		border: none;
		border-radius: var(--radius-control);
		background: transparent;
		cursor: default;
	}

	.session-select:focus {
		outline: none;
	}

	.session-select:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}

	.session-select-toggle {
		position: relative;
		z-index: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		width: var(--touch-min);
		flex-shrink: 0;
		pointer-events: none;
		color: var(--ink);
	}

	.session-select-mark {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		box-sizing: border-box;
		width: var(--space-4);
		height: var(--space-4);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-control);
		background: transparent;
		color: var(--surface);
		line-height: 1;
	}

	.session-select-mark.checked {
		border-color: var(--ink);
		background: var(--ink);
	}

	.session-name {
		position: relative;
		z-index: 1;
		margin: 0;
		font-size: var(--text-body);
		font-weight: 600;
		min-width: 0;
		flex: 1;
		pointer-events: none;
	}

	.session-meta {
		display: flex;
		align-items: baseline;
		gap: var(--space-4);
		margin: 0;
		color: var(--ink-muted);
		font-size: var(--text-annotation);
		font-weight: 600;
		letter-spacing: 0.04em;
		line-height: 1;
		flex-shrink: 0;
	}

	.lead {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-2);
		margin: var(--space-5) auto 0;
		max-width: 40rem;
		text-align: center;
		font-size: var(--text-meta);
		color: var(--ink-muted);
	}

	.lead-text {
		display: block;
	}

	@media (min-width: 900px) {
		.collection-scroll {
			padding-top: var(--space-3);
			padding-bottom: var(--space-5);
		}
	}
</style>
