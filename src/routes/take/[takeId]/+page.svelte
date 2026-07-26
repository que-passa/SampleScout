<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getTake } from '$lib/persistence';
	import {
		EditRecipeHistory,
		MIN_SEGMENT_SECONDS,
		adjustRetainedBoundary,
		applyFadeIn,
		applyFadeOut,
		cutSelection,
		deriveCatalogReference,
		deriveSpecimenMark,
		enablePeakNormalization,
		formatRecordingDate,
		formatUploadStateLabel,
		isIdentityRecipe,
		isTakeSavedLocally,
		recipeDurationSeconds,
		retainedSourceRanges,
		trimToSelection,
		uploadStateTone,
		type EditRecipe,
		type Take
	} from '$lib/domain';
	import { ensurePeaksForTake, type LoadedPeaks } from '$lib/audio/peaks';
	import { readBinary } from '$lib/persistence/opfs';
	import { decodeAudioPlanar, type DecodedPlanarAudio } from '$lib/audio/decode';
	import { planarToAudioBuffer, renderRecipePlanar } from '$lib/audio/render';
	import {
		createPlaybackFromAudioBuffer,
		createPlaybackFromFileRef,
		type PlaybackHandle
	} from '$lib/audio/playback';
	import {
		actionToast,
		discardLocalDraft,
		extractSelectionAsLocalDraft,
		onTakeInventoryChanged,
		onUploadQueueChanged,
		renameTakeDisplayName,
		saveTakeEditRecipe,
		saveTakeMetadata
	} from '$lib/state';
	import type { TakeMetadataPatch } from '$lib/domain';
	import AccountButton from '$lib/ui/components/AccountButton.svelte';
	import BackButton from '$lib/ui/components/BackButton.svelte';
	import ConfirmDialog from '$lib/ui/components/ConfirmDialog.svelte';
	import EmptyState from '$lib/ui/components/EmptyState.svelte';
	import SheetOverlay from '$lib/ui/components/SheetOverlay.svelte';
	import UploadSettingsPanel from '$lib/ui/components/UploadSettingsPanel.svelte';
	import FieldNotesEditor from '$lib/ui/components/FieldNotesEditor.svelte';
	import SpecimenMark from '$lib/ui/components/SpecimenMark.svelte';
	import StatusLabel from '$lib/ui/components/StatusLabel.svelte';
	import AppShell from '$lib/ui/layouts/AppShell.svelte';
	import WaveformOverview from '$lib/ui/waveform/WaveformOverview.svelte';

	const takeId = $derived(page.params.takeId ?? '');

	let take = $state<Take | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let playback = $state<PlaybackHandle | null>(null);
	let playbackRecipeKey = $state<string | null>(null);
	let previewBuffer = $state.raw<AudioBuffer | null>(null);
	let playing = $state(false);
	let currentTime = $state(0);
	let displayPlayhead = $state(0);
	let editingName = $state(false);
	let draftName = $state('');
	let peaks = $state<LoadedPeaks | null>(null);
	let peaksAnalyzing = $state(false);
	let peaksError = $state<string | null>(null);
	let playheadRaf = 0;

	/** Cached full decode for zoomed waveform detail (released on leave / take change). */
	let detailPcmCache = $state.raw<DecodedPlanarAudio | null>(null);
	let detailPcmTakeId: string | null = null;
	let detailPcmInflight: Promise<DecodedPlanarAudio | null> | null = null;
	/** Dock host for waveform zoom + overview navigator (first bottom-bar row). */
	let waveChromeHost = $state<HTMLElement | null>(null);

	let editHistory = $state.raw<EditRecipeHistory | null>(null);
	let historyEpoch = $state(0);
	let selectionStart = $state<number | null>(null);
	let selectionEnd = $state<number | null>(null);
	let editError = $state<string | null>(null);
	let savingFieldNotes = $state(false);
	let fieldNotesError = $state<string | null>(null);
	let editSheetOpen = $state(false);
	let uploadSheetOpen = $state(false);
	let loopPreview = $state(false);
	let discardConfirmOpen = $state(false);
	let discarding = $state(false);

	const sourceDuration = $derived(peaks?.durationSeconds || take?.source.durationSeconds || 0);

	const currentRecipe = $derived.by(() => {
		void historyEpoch;
		return editHistory?.current ?? take?.editRecipe ?? null;
	});

	const canUndo = $derived.by(() => {
		void historyEpoch;
		return editHistory?.canUndo ?? false;
	});

	const canRedo = $derived.by(() => {
		void historyEpoch;
		return editHistory?.canRedo ?? false;
	});

	const identity = $derived(
		currentRecipe != null && sourceDuration > 0
			? isIdentityRecipe(currentRecipe, sourceDuration)
			: true
	);

	const editedDuration = $derived(
		currentRecipe ? recipeDurationSeconds(currentRecipe) : sourceDuration
	);

	/** Always pass ranges (including identity 0→duration) so trim grips stay visible. */
	const retainedRanges = $derived(currentRecipe ? retainedSourceRanges(currentRecipe) : undefined);

	const hasUsableSelection = $derived(
		selectionStart != null &&
			selectionEnd != null &&
			Math.abs(selectionEnd - selectionStart) >= MIN_SEGMENT_SECONDS
	);

	function bumpHistory() {
		historyEpoch += 1;
	}

	function recipeKey(recipe: EditRecipe): string {
		return JSON.stringify(recipe);
	}

	function editedTimeToSourceTime(recipe: EditRecipe, editedSeconds: number): number {
		let remaining = Math.max(0, editedSeconds);
		for (const segment of recipe.segments) {
			const duration = Math.max(0, segment.sourceEndSeconds - segment.sourceStartSeconds);
			if (remaining <= duration) {
				return segment.sourceStartSeconds + remaining;
			}
			remaining -= duration;
		}
		const last = recipe.segments[recipe.segments.length - 1];
		return last?.sourceEndSeconds ?? editedSeconds;
	}

	function sourceTimeToEditedTime(recipe: EditRecipe, sourceSeconds: number): number {
		let accumulated = 0;
		for (const segment of recipe.segments) {
			if (sourceSeconds < segment.sourceStartSeconds) return accumulated;
			if (sourceSeconds <= segment.sourceEndSeconds) {
				return accumulated + (sourceSeconds - segment.sourceStartSeconds);
			}
			accumulated += Math.max(0, segment.sourceEndSeconds - segment.sourceStartSeconds);
		}
		return accumulated;
	}

	function disposePlayback() {
		stopPlayheadLoop();
		playback?.dispose();
		playback = null;
		playbackRecipeKey = null;
		if (previewBuffer) {
			try {
				for (let ch = 0; ch < previewBuffer.numberOfChannels; ch += 1) {
					previewBuffer.getChannelData(ch).fill(0);
				}
			} catch {
				/* ignore */
			}
		}
		previewBuffer = null;
		playing = false;
	}

	function syncHistoryFromTake(loaded: Take) {
		if (!editHistory) {
			editHistory = new EditRecipeHistory(loaded.editRecipe);
			bumpHistory();
			return;
		}
		if (recipeKey(editHistory.current) === recipeKey(loaded.editRecipe)) {
			return;
		}
		editHistory.replace(loaded.editRecipe);
		bumpHistory();
	}

	function clearHistory() {
		editHistory = null;
		historyEpoch = 0;
	}

	function onSelectionChange(start: number, end: number) {
		selectionStart = start;
		selectionEnd = end;
	}

	async function persistRecipe(recipe: EditRecipe) {
		if (!take) return;
		disposePlayback();
		const updated = await saveTakeEditRecipe(take.id, recipe);
		take = { ...take, editRecipe: updated.editRecipe };
	}

	async function applyRecipeMutation(
		mutate: (recipe: EditRecipe) => EditRecipe,
		feedback?: string
	): Promise<boolean> {
		if (!take || !editHistory) return false;
		editError = null;
		try {
			const next = mutate(editHistory.current);
			const committed = editHistory.commit(next);
			bumpHistory();
			await persistRecipe(committed);
			if (feedback) actionToast.show(feedback);
			return true;
		} catch (cause) {
			editError =
				cause instanceof Error && cause.message.trim() ? cause.message : 'Could not apply edit.';
			return false;
		}
	}

	async function onTrim() {
		if (!hasUsableSelection || selectionStart == null || selectionEnd == null) return;
		const start = selectionStart;
		const end = selectionEnd;
		await applyRecipeMutation((recipe) => trimToSelection(recipe, start, end), 'Trim applied');
	}

	async function onTrimBoundaryCommit(detail: {
		rangeIndex: number;
		edge: 'start' | 'end';
		seconds: number;
	}) {
		await applyRecipeMutation((recipe) =>
			adjustRetainedBoundary(recipe, detail.rangeIndex, detail.edge, detail.seconds, sourceDuration)
		);
	}

	async function onFadeBoundaryCommit(detail: { edge: 'in' | 'out'; seconds: number }) {
		await applyRecipeMutation((recipe) =>
			detail.edge === 'in'
				? applyFadeIn(recipe, detail.seconds)
				: applyFadeOut(recipe, detail.seconds)
		);
	}

	async function onCut() {
		if (!hasUsableSelection || selectionStart == null || selectionEnd == null) return;
		const start = selectionStart;
		const end = selectionEnd;
		await applyRecipeMutation((recipe) => cutSelection(recipe, start, end), 'Cut applied');
	}

	async function onExtract() {
		if (!take || !hasUsableSelection || selectionStart == null || selectionEnd == null) return;
		const start = selectionStart;
		const end = selectionEnd;
		editError = null;
		try {
			await extractSelectionAsLocalDraft({
				parentTakeId: take.id,
				startSeconds: start,
				endSeconds: end
			});
			selectionStart = null;
			selectionEnd = null;
		} catch (cause) {
			const message =
				cause && typeof cause === 'object' && 'message' in cause
					? String((cause as { message: string }).message)
					: cause instanceof Error
						? cause.message
						: 'Could not extract selection.';
			editError = message.trim() || 'Could not extract selection.';
		}
	}

	async function onNormalize() {
		await applyRecipeMutation((recipe) => enablePeakNormalization(recipe), 'Normalize applied');
	}

	async function onUndo() {
		if (!take || !editHistory) return;
		const previous = editHistory.undo();
		if (!previous) return;
		bumpHistory();
		editError = null;
		try {
			await persistRecipe(previous);
			actionToast.show('Edit undone');
		} catch (cause) {
			editError =
				cause instanceof Error && cause.message.trim() ? cause.message : 'Could not undo edit.';
		}
	}

	async function onRedo() {
		if (!take || !editHistory) return;
		const next = editHistory.redo();
		if (!next) return;
		bumpHistory();
		editError = null;
		try {
			await persistRecipe(next);
			actionToast.show('Edit redone');
		} catch (cause) {
			editError =
				cause instanceof Error && cause.message.trim() ? cause.message : 'Could not redo edit.';
		}
	}

	async function onResetEdits() {
		if (!take || !editHistory || sourceDuration <= 0) return;
		editError = null;
		try {
			const next = editHistory.resetToIdentity(sourceDuration);
			bumpHistory();
			await persistRecipe(next);
			actionToast.show('Edits reset');
		} catch (cause) {
			editError =
				cause instanceof Error && cause.message.trim() ? cause.message : 'Could not reset edits.';
		}
	}

	async function loadTake(id: string) {
		if (detailPcmTakeId && detailPcmTakeId !== id) clearDetailPcmCache();
		const foundTake = await getTake(id);
		if (foundTake && foundTake.lifecycleState === 'saved') {
			take = foundTake;
			draftName = foundTake.metadata.displayName;
			error = null;
			syncHistoryFromTake(foundTake);
		} else if (foundTake) {
			take = null;
			clearHistory();
			error = 'Take is no longer available';
		} else {
			take = null;
			clearHistory();
			error = 'Take not found';
		}
	}

	async function loadPeaks(current: Take) {
		peaksAnalyzing = true;
		peaksError = null;
		try {
			const loaded = await ensurePeaksForTake(current);
			peaks = loaded;
			if (loaded.asset && (!current.peaks || current.peaks.fileRef !== loaded.asset.fileRef)) {
				take = { ...current, peaks: loaded.asset };
			}
		} catch (cause) {
			peaks = null;
			const detail =
				cause && typeof cause === 'object' && 'message' in cause
					? String((cause as { message: unknown }).message)
					: null;
			peaksError = detail?.trim()
				? `Could not analyze waveform — ${detail}`
				: 'Could not analyze waveform';
			console.error('[SampleScout] peak analysis failed', cause);
		} finally {
			peaksAnalyzing = false;
		}
	}

	function stopPlayheadLoop() {
		if (playheadRaf) {
			cancelAnimationFrame(playheadRaf);
			playheadRaf = 0;
		}
	}

	/** Playback-timeline bounds for loop wrap (edited seconds when recipe is non-identity). */
	function getLoopBoundsEdited(): { start: number; end: number } | null {
		if (!currentRecipe || transportDuration <= 0) return null;
		if (hasUsableSelection && selectionStart != null && selectionEnd != null) {
			const srcLo = Math.min(selectionStart, selectionEnd);
			const srcHi = Math.max(selectionStart, selectionEnd);
			if (identity) {
				return { start: srcLo, end: srcHi };
			}
			const start = sourceTimeToEditedTime(currentRecipe, srcLo);
			const end = sourceTimeToEditedTime(currentRecipe, srcHi);
			if (end - start < MIN_SEGMENT_SECONDS) return { start: 0, end: transportDuration };
			return { start, end };
		}
		return { start: 0, end: transportDuration };
	}

	function syncPlayheadFromHandle(handle: PlaybackHandle) {
		if (!currentRecipe) return;
		currentTime = handle.getCurrentTime();
		displayPlayhead = identity ? currentTime : editedTimeToSourceTime(currentRecipe, currentTime);
	}

	async function wrapLoopPlayback(handle: PlaybackHandle) {
		const bounds = getLoopBoundsEdited();
		if (!bounds) return;
		handle.seek(bounds.start);
		syncPlayheadFromHandle(handle);
		try {
			await handle.play();
			playing = true;
			startPlayheadLoop();
		} catch {
			playing = false;
			stopPlayheadLoop();
		}
	}

	function startPlayheadLoop() {
		stopPlayheadLoop();
		const tick = () => {
			if (!playback || !currentRecipe) return;
			syncPlayheadFromHandle(playback);
			playing = playback.isPlaying();

			if (playing && loopPreview) {
				const bounds = getLoopBoundsEdited();
				if (bounds && currentTime >= bounds.end - 0.002) {
					playback.seek(bounds.start);
					syncPlayheadFromHandle(playback);
				}
			}

			if (playing) {
				playheadRaf = requestAnimationFrame(tick);
			} else {
				playheadRaf = 0;
			}
		};
		playheadRaf = requestAnimationFrame(tick);
	}

	onMount(() => {
		const id = takeId;
		if (!id) {
			error = 'No take ID provided';
			loading = false;
			return;
		}

		const refreshTake = () => {
			void (async () => {
				await loadTake(id);
				if (take) await loadPeaks(take);
			})();
		};

		const unsubInventory = onTakeInventoryChanged(refreshTake);
		const unsubUpload = onUploadQueueChanged(refreshTake);

		void (async () => {
			try {
				await loadTake(id);
				if (take) await loadPeaks(take);
			} catch {
				error = 'Failed to load take';
			} finally {
				loading = false;
			}
		})();

		return () => {
			unsubInventory();
			unsubUpload();
		};
	});

	onDestroy(() => {
		disposePlayback();
		clearHistory();
		detailPcmCache = null;
		detailPcmTakeId = null;
		detailPcmInflight = null;
	});

	function clearDetailPcmCache() {
		detailPcmCache = null;
		detailPcmTakeId = null;
		detailPcmInflight = null;
	}

	async function ensureDetailPcm(): Promise<DecodedPlanarAudio | null> {
		const current = take;
		if (!current?.source.fileRef) return null;
		if (detailPcmCache && detailPcmTakeId === current.id) return detailPcmCache;
		if (detailPcmInflight && detailPcmTakeId === current.id) return detailPcmInflight;

		const takeKey = current.id;
		detailPcmTakeId = takeKey;
		detailPcmInflight = (async () => {
			try {
				const file = await readBinary(current.source.fileRef!);
				const planar = await decodeAudioPlanar(file, current.source.mimeType);
				if (detailPcmTakeId !== takeKey) return null;
				detailPcmCache = planar;
				return planar;
			} catch (cause) {
				console.error('[SampleScout] detail waveform decode failed', cause);
				if (detailPcmTakeId === takeKey) {
					detailPcmCache = null;
				}
				return null;
			} finally {
				if (detailPcmTakeId === takeKey) detailPcmInflight = null;
			}
		})();

		return detailPcmInflight;
	}

	function formatClock(seconds: number): string {
		const clamped = Math.max(0, seconds);
		const mins = Math.floor(clamped / 60);
		const secs = clamped - mins * 60;
		const whole = Math.floor(secs);
		const ms = Math.floor((secs - whole) * 1000);
		return `${String(mins).padStart(2, '0')}:${String(whole).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
	}

	function toggleEditSheet() {
		editSheetOpen = !editSheetOpen;
		if (editSheetOpen) {
			uploadSheetOpen = false;
		}
	}

	function toggleUploadSheet() {
		uploadSheetOpen = !uploadSheetOpen;
		if (uploadSheetOpen) {
			editSheetOpen = false;
		}
	}

	const channelLabel = $derived(
		(peaks?.channels ?? take?.source.channelCount ?? 1) > 1 ? 'Stereo' : 'Mono'
	);

	const transportDuration = $derived(identity ? sourceDuration : editedDuration);

	async function ensurePlayback(): Promise<PlaybackHandle | null> {
		if (!take?.source.fileRef || !currentRecipe) return null;

		const key = recipeKey(currentRecipe);
		if (playback && playbackRecipeKey === key) return playback;

		disposePlayback();

		let handle: PlaybackHandle;
		if (isIdentityRecipe(currentRecipe, sourceDuration)) {
			handle = await createPlaybackFromFileRef(take.source.fileRef, take.source.mimeType);
		} else {
			const file = await readBinary(take.source.fileRef);
			const planar = await decodeAudioPlanar(file, take.source.mimeType);
			const rendered = renderRecipePlanar(planar, currentRecipe);
			const buffer = planarToAudioBuffer(rendered);
			previewBuffer = buffer;
			handle = await createPlaybackFromAudioBuffer(buffer);
		}

		handle.onEnded(() => {
			if (loopPreview) {
				void wrapLoopPlayback(handle);
				return;
			}
			playing = false;
			syncPlayheadFromHandle(handle);
			stopPlayheadLoop();
		});
		playback = handle;
		playbackRecipeKey = key;
		return handle;
	}

	async function togglePlayback() {
		if (!take?.source.fileRef) return;

		try {
			const handle = await ensurePlayback();
			if (!handle) return;

			if (playing) {
				handle.pause();
				playing = false;
				syncPlayheadFromHandle(handle);
				stopPlayheadLoop();
				return;
			}

			if (loopPreview) {
				const bounds = getLoopBoundsEdited();
				if (bounds) {
					const outside = currentTime < bounds.start - 0.001 || currentTime >= bounds.end - 0.002;
					if (hasUsableSelection || outside) {
						handle.seek(bounds.start);
						syncPlayheadFromHandle(handle);
					}
				}
			}

			await handle.play();
			playing = true;
			startPlayheadLoop();
		} catch {
			playing = false;
			stopPlayheadLoop();
		}
	}

	function onSeek(seconds: number) {
		void (async () => {
			try {
				const handle = await ensurePlayback();
				if (!handle || !currentRecipe) return;
				const seekTime = identity ? seconds : sourceTimeToEditedTime(currentRecipe, seconds);
				handle.seek(seekTime);
				syncPlayheadFromHandle(handle);
			} catch {
				/* ignore seek failures */
			}
		})();
	}

	function autofocus(node: HTMLInputElement) {
		node.focus();
		node.select();
	}

	async function commitName() {
		if (!take || !editingName) return;
		editingName = false;
		const next = draftName.trim() || take.metadata.displayName;
		draftName = next;
		if (next !== take.metadata.displayName) {
			take = await renameTakeDisplayName(take.id, next);
			actionToast.show('Name updated');
		}
	}

	function cancelName() {
		draftName = take?.metadata.displayName ?? '';
		editingName = false;
	}

	function onNameKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			void commitName();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			cancelName();
		}
	}

	function requestDiscard() {
		if (!take || discarding) return;
		discardConfirmOpen = true;
	}

	function cancelDiscard() {
		if (discarding) return;
		discardConfirmOpen = false;
	}

	async function confirmDiscard() {
		if (!take || discarding) return;
		discarding = true;
		try {
			disposePlayback();
			clearHistory();
			const id = take.id;
			await discardLocalDraft(id);
			discardConfirmOpen = false;
			editSheetOpen = false;
			await goto(resolve('/drafts'));
		} finally {
			discarding = false;
		}
	}

	async function onSaveFieldNotes(patch: TakeMetadataPatch) {
		if (!take || savingFieldNotes) return;
		savingFieldNotes = true;
		fieldNotesError = null;
		try {
			take = await saveTakeMetadata(take.id, patch);
			draftName = take.metadata.displayName;
			actionToast.show('Field Notes saved');
		} catch (cause) {
			fieldNotesError =
				cause && typeof cause === 'object' && 'message' in cause
					? String((cause as { message: string }).message)
					: 'Could not save Field Notes.';
		} finally {
			savingFieldNotes = false;
		}
	}

	const displayName = $derived(take?.metadata.displayName || `Take ${takeId.slice(0, 8)}`);
</script>

<svelte:head>
	<title>{displayName} · SampleScout</title>
</svelte:head>

<AppShell>
	{#if loading}
		<section class="loading-section">
			<p>Loading take…</p>
		</section>
	{:else if error}
		<section class="error-section">
			<EmptyState
				title="Take not found"
				body={error}
				actionLabel="Back to Collection"
				onaction={() => {
					window.location.assign(resolve('/drafts'));
				}}
			/>
		</section>
	{:else if take}
		<section class="workspace">
			<header class="editor-header">
				<BackButton href={resolve('/drafts')} label="Collection" />
				<div class="title-slot">
					{#if editingName}
						<input
							{@attach autofocus}
							type="text"
							class="take-title-input"
							bind:value={draftName}
							onblur={() => void commitName()}
							onkeydown={onNameKeydown}
							aria-label="Take name"
						/>
					{:else}
						<button type="button" class="take-title" onclick={() => (editingName = true)}>
							{displayName}
						</button>
					{/if}
				</div>
				<div class="header-end">
					<AccountButton />
				</div>
			</header>

			<div class="workspace-body">
				<div class="waveform-stage">
					<WaveformOverview
						chrome="stage"
						dockChrome
						chromeHost={waveChromeHost}
						data={peaks?.data ?? null}
						channels={peaks?.channels ?? take.source.channelCount ?? 1}
						peakCount={peaks?.peakCount ?? 0}
						durationSeconds={sourceDuration}
						currentTime={displayPlayhead}
						analyzing={peaksAnalyzing}
						error={peaksError}
						detailSourceKey={take.id}
						{ensureDetailPcm}
						bind:selectionStart
						bind:selectionEnd
						{retainedRanges}
						{onSeek}
						{onSelectionChange}
						{onTrimBoundaryCommit}
						{onFadeBoundaryCommit}
						onRetry={() => {
							const current = take;
							if (current) void loadPeaks(current);
						}}
					>
						{#snippet chromeActions()}
							<button type="button" class="chrome-action" onclick={() => void onNormalize()}>
								Normalize
							</button>
							<button
								type="button"
								class="chrome-action"
								disabled={!hasUsableSelection}
								onclick={() => void onTrim()}
							>
								Trim
							</button>
							<button
								type="button"
								class="chrome-action"
								disabled={!hasUsableSelection}
								onclick={() => void onExtract()}
							>
								Extract
							</button>
						{/snippet}
					</WaveformOverview>
				</div>
			</div>

			<div class="workspace-dock">
				<div class="bottom-bar">
					<div
						class="wave-chrome-row"
						bind:this={waveChromeHost}
						aria-label="Waveform navigation"
					></div>
					<div class="transport-bar">
						<button
							type="button"
							class={['secondary-button', 'transport-edit', editSheetOpen && 'active']}
							onclick={toggleEditSheet}
							aria-expanded={editSheetOpen}
							aria-haspopup="dialog"
						>
							Edit
						</button>
						<div class="transport-center">
							<div class="transport-play-row">
								<button type="button" class="play-button" onclick={() => void togglePlayback()}>
									{playing ? 'Pause' : 'Play'}
								</button>
								<button
									type="button"
									class={['loop-button', loopPreview && 'active']}
									aria-label="Loop"
									aria-pressed={loopPreview}
									title="Loop"
									onclick={() => {
										loopPreview = !loopPreview;
									}}
								>
									<svg
										class="loop-icon"
										viewBox="0 0 24 24"
										width="20"
										height="20"
										aria-hidden="true"
										focusable="false"
										fill="currentColor"
									>
										<path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" />
									</svg>
								</button>
							</div>
							<p class="transport-clock" aria-live="polite">
								{formatClock(currentTime)} / {formatClock(transportDuration)}
							</p>
						</div>
						<button
							type="button"
							class={['upload-button', 'transport-side', uploadSheetOpen && 'active']}
							onclick={toggleUploadSheet}
							aria-expanded={uploadSheetOpen}
							aria-haspopup="dialog"
						>
							Upload
						</button>
					</div>
				</div>
			</div>
		</section>

		{#if uploadSheetOpen}
			<SheetOverlay title="Upload" onclose={() => (uploadSheetOpen = false)}>
				<UploadSettingsPanel
					embedded
					{take}
					channelCount={take.source.channelCount || peaks?.channels || 1}
					sampleRate={take.source.sampleRate || peaks?.sampleRate || 48000}
					durationSeconds={editedDuration || take.source.durationSeconds}
					onsaved={async (updated) => {
						take = updated;
					}}
					onuploaded={async (updated) => {
						const refreshed = await getTake(updated.id);
						if (refreshed) take = refreshed;
					}}
				/>
			</SheetOverlay>
		{/if}

		{#if editSheetOpen}
			<SheetOverlay title="Edit" onclose={() => (editSheetOpen = false)}>
				<div class="editor-tools">
					<div class="tool-row">
						<button
							type="button"
							class="secondary-button"
							disabled={!hasUsableSelection}
							onclick={() => void onCut()}
						>
							Cut
						</button>
						<button
							type="button"
							class="secondary-button"
							disabled={!canUndo}
							onclick={() => void onUndo()}
						>
							Undo
						</button>
						<button
							type="button"
							class="secondary-button"
							disabled={!canRedo}
							onclick={() => void onRedo()}
						>
							Redo
						</button>
						<button
							type="button"
							class="secondary-button"
							disabled={identity}
							onclick={() => void onResetEdits()}
						>
							Reset
						</button>
					</div>
					{#if editError}
						<p class="edit-error" role="alert">{editError}</p>
					{/if}

					<section class="field-notes-section" aria-label="Field Notes">
						<h2 class="section-heading">Field Notes</h2>
						<div class="catalog-summary">
							<SpecimenMark mark={deriveSpecimenMark(take)} />
							<div>
								<span class="metadata-label">Local catalog reference</span>
								<strong class="catalog-reference">{deriveCatalogReference(take)}</strong>
							</div>
						</div>

						<FieldNotesEditor
							metadata={take.metadata}
							saving={savingFieldNotes}
							onsave={onSaveFieldNotes}
						/>
						{#if fieldNotesError}
							<p class="edit-error" role="alert">{fieldNotesError}</p>
						{/if}

						<div class="metadata-grid">
							<div class="metadata-item">
								<span class="metadata-label">Playhead</span>
								<span class="metadata-value">{formatClock(displayPlayhead)}</span>
							</div>

							<div class="metadata-item">
								<span class="metadata-label">Duration</span>
								<span class="metadata-value">{formatClock(sourceDuration)}</span>
							</div>

							{#if !identity}
								<div class="metadata-item">
									<span class="metadata-label">Edited duration</span>
									<span class="metadata-value">{formatClock(editedDuration)}</span>
								</div>
							{/if}

							<div class="metadata-item">
								<span class="metadata-label">Channel</span>
								<span class="metadata-value">{channelLabel}</span>
							</div>

							{#if selectionStart != null && selectionEnd != null}
								<div class="metadata-item">
									<span class="metadata-label">Selection</span>
									<span class="metadata-value">
										{formatClock(Math.min(selectionStart, selectionEnd))}–{formatClock(
											Math.max(selectionStart, selectionEnd)
										)}
									</span>
								</div>
							{/if}

							{#if take.source.sourceType === 'import' && take.source.originalFileName}
								<div class="metadata-item">
									<span class="metadata-label">Original file</span>
									<span class="metadata-value">{take.source.originalFileName}</span>
								</div>
							{/if}

							{#if take.derivedFromTakeId}
								<div class="metadata-item">
									<span class="metadata-label">Extracted from</span>
									<span class="metadata-value">
										<a class="derived-link" href={resolve(`/take/${take.derivedFromTakeId}`)}>
											Parent take
										</a>
									</span>
								</div>
							{/if}

							<div class="metadata-item">
								<span class="metadata-label">Format</span>
								<span class="metadata-value">{take.source.mimeType}</span>
							</div>

							<div class="metadata-item">
								<span class="metadata-label">Size</span>
								<span class="metadata-value">{Math.round(take.source.byteLength / 1024)} KB</span>
							</div>

							<div class="metadata-item">
								<span class="metadata-label">Sequence</span>
								<span class="metadata-value">#{String(take.sequence).padStart(3, '0')}</span>
							</div>

							<div class="metadata-item">
								<span class="metadata-label">Created</span>
								<span class="metadata-value">{formatRecordingDate(take.createdAt)}</span>
							</div>

							<div class="metadata-item">
								<span class="metadata-label">Status</span>
								{#if take.uploadState !== 'not-queued'}
									<StatusLabel tone={uploadStateTone(take.uploadState)}>
										{formatUploadStateLabel(take.uploadState)}
									</StatusLabel>
								{:else}
									<StatusLabel tone={isTakeSavedLocally(take) ? 'ok' : 'muted'}>
										{isTakeSavedLocally(take) ? 'LOCAL DRAFT · THIS DEVICE' : 'Not saved'}
									</StatusLabel>
								{/if}
							</div>
						</div>
					</section>

					<div class="tool-row danger-row">
						<button
							type="button"
							class="discard-icon-button"
							onclick={requestDiscard}
							aria-label="Discard take"
							title="Discard"
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
						</button>
					</div>
				</div>
			</SheetOverlay>
		{/if}

		{#if discardConfirmOpen && take}
			<ConfirmDialog
				title="Discard"
				message={`Discard “${displayName}”? It will be removed from this device.`}
				confirmLabel="Discard"
				busy={discarding}
				oncancel={cancelDiscard}
				onconfirm={() => void confirmDiscard()}
			/>
		{/if}
	{/if}
</AppShell>

<style>
	.loading-section,
	.error-section {
		box-sizing: border-box;
		height: 100%;
		min-height: 0;
		padding: var(--space-5);
		text-align: center;
		color: var(--ink-muted);
	}

	.workspace {
		height: 100%;
		min-height: 0;
		display: grid;
		grid-template-rows: auto 1fr auto;
		overflow: hidden;
		gap: 0;
	}

	.editor-header {
		display: grid;
		grid-template-columns: minmax(var(--touch-min), 1fr) minmax(0, 2.5fr) minmax(
				var(--touch-min),
				1fr
			);
		align-items: center;
		column-gap: var(--space-2);
		min-height: var(--touch-min);
		padding: var(--space-2) var(--space-4);
		border-bottom: 1px solid var(--line);
		background: var(--paper);
		z-index: 1;
	}

	.title-slot {
		min-width: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.header-end {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		justify-self: end;
		min-width: var(--touch-min);
		min-height: var(--touch-min);
	}

	.take-title,
	.take-title-input {
		margin: 0;
		font-size: var(--text-title);
		font-weight: 600;
	}

	.take-title {
		max-width: 100%;
		padding: 0;
		border: none;
		background: transparent;
		color: inherit;
		cursor: pointer;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		text-align: center;
		text-decoration: underline;
		text-decoration-color: var(--line);
		text-underline-offset: var(--space-1);
	}

	.take-title:hover {
		text-decoration-color: var(--ink-muted);
	}

	.take-title-input {
		width: 100%;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--ink);
		border-radius: var(--radius-control);
		background: var(--surface);
		text-align: center;
	}

	.workspace-body {
		display: grid;
		grid-template-rows: minmax(0, 1fr);
		min-height: 0;
		overflow: hidden;
		padding: 0;
	}

	.waveform-stage {
		min-width: 0;
		min-height: 0;
		height: 100%;
		display: flex;
		flex-direction: column;
	}

	.waveform-stage :global(.waveform-overview) {
		flex: 1 1 auto;
		min-height: 0;
		width: 100%;
	}

	.workspace-dock {
		display: flex;
		flex-direction: column;
		min-height: 0;
		background: var(--paper);
	}

	.bottom-bar {
		display: flex;
		flex-direction: column;
		min-width: 0;
		border-top: 1px solid var(--line);
		background: var(--paper);
		z-index: 1;
	}

	.wave-chrome-row {
		box-sizing: border-box;
		min-width: 0;
		padding: var(--space-2) var(--space-4);
	}

	.wave-chrome-row:empty {
		display: none;
	}

	.editor-tools {
		display: grid;
		gap: var(--space-3);
	}

	.field-notes-section {
		display: grid;
		gap: var(--space-3);
		padding-top: var(--space-3);
		border-top: 1px solid var(--line);
	}

	.section-heading {
		margin: 0;
		font-size: var(--text-label);
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}

	.tool-row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.danger-row {
		padding-top: var(--space-2);
		border-top: 1px solid var(--line);
	}

	.discard-icon-button {
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

	.discard-icon-button:hover {
		background: var(--surface-subtle);
	}

	.discard-icon-button:focus-visible {
		outline: 2px solid var(--signal);
		outline-offset: 2px;
	}

	.trash-icon {
		display: block;
	}

	.edit-error {
		margin: 0;
		font-size: var(--text-meta);
		font-weight: 600;
		color: var(--signal);
	}

	.catalog-summary {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding-bottom: var(--space-3);
		border-bottom: 1px solid var(--line);
		margin-bottom: var(--space-3);
	}

	.catalog-summary > div {
		display: grid;
		gap: var(--space-1);
		min-width: 0;
	}

	.catalog-reference {
		overflow: hidden;
		font-size: var(--text-body);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.metadata-grid {
		display: grid;
		gap: var(--space-3);
		margin-top: var(--space-4);
		padding-top: var(--space-3);
		border-top: 1px solid var(--line);
	}

	.metadata-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) 0;
		border-bottom: 1px solid var(--line);
	}

	.metadata-item:last-child {
		border-bottom: none;
	}

	.metadata-label {
		font-size: var(--text-meta);
		font-weight: 600;
		color: var(--ink-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.metadata-value {
		font-size: var(--text-body);
		font-weight: 600;
		font-family: var(--font-mono);
		text-align: right;
	}

	.derived-link {
		color: var(--ink);
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.derived-link:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}

	.transport-bar {
		display: grid;
		grid-template-columns: minmax(var(--touch-min), 1fr) auto minmax(var(--touch-min), 1fr);
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-4);
		padding-bottom: calc(var(--space-2) + env(safe-area-inset-bottom, 0px));
		background: var(--paper);
	}

	.transport-side {
		justify-self: stretch;
	}

	.transport-edit {
		justify-self: start;
		width: auto;
		padding: 0 var(--space-2);
	}

	.transport-bar > .transport-side:last-child {
		justify-self: end;
	}

	.transport-center {
		display: grid;
		justify-items: center;
		gap: var(--space-1);
	}

	.transport-play-row {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
	}

	.transport-clock {
		margin: 0;
		font-size: var(--text-meta);
		font-weight: 600;
		font-family: var(--font-mono);
		letter-spacing: 0.02em;
		color: var(--ink-muted);
		white-space: nowrap;
	}

	.play-button,
	.secondary-button,
	.upload-button {
		min-height: var(--touch-min);
		padding: 0 var(--space-4);
		border-radius: var(--radius-control);
		font-size: var(--text-button);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		cursor: pointer;
	}

	.transport-edit.secondary-button {
		padding: 0 var(--space-2);
	}

	.loop-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		min-width: var(--touch-min);
		min-height: var(--touch-min);
		padding: 0;
		border: 1px solid var(--ink);
		border-radius: var(--radius-control);
		background: var(--surface);
		color: var(--ink);
		cursor: pointer;
	}

	.loop-icon {
		display: block;
	}

	.play-button {
		min-width: calc(var(--touch-min) * 2.5);
		border: 1px solid var(--ink);
		background: var(--ink);
		color: var(--surface);
	}

	.secondary-button {
		border: 1px solid var(--ink);
		background: var(--surface);
		color: var(--ink);
	}

	.upload-button {
		border: 1px solid var(--ink);
		background: var(--ink);
		color: var(--surface);
	}

	.play-button:hover,
	.upload-button:hover {
		background: var(--surface);
		color: var(--ink);
	}

	.secondary-button:hover:not(:disabled),
	.loop-button:hover {
		background: var(--surface-subtle);
	}

	.secondary-button.active,
	.upload-button.active,
	.loop-button.active {
		background: var(--surface-subtle);
		color: var(--ink);
	}

	.secondary-button:disabled {
		border-color: var(--disabled);
		color: var(--disabled);
		cursor: not-allowed;
	}
</style>
