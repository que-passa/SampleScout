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
		collectableRetainedBounds,
		deriveCatalogReference,
		deriveSpecimenMark,
		enablePeakNormalization,
		formatRecordingDate,
		formatUploadStateLabel,
		isActiveTakeUploadState,
		isActiveUploadJobState,
		isIdentityRecipe,
		isTakeSavedLocally,
		recipeDurationSeconds,
		retainedSourceRanges,
		trimToSelection,
		uploadStateTone,
		type EditRecipe,
		type Take,
		type TakeMetadataPatch
	} from '$lib/domain';
	import { ensurePeaksForTake, type LoadedPeaks } from '$lib/audio/peaks';
	import {
		ensureSuggestedRegionsForTake,
		isEligibleForSuggestedRegions
	} from '$lib/audio/suggest/ensure';
	import type { SuggestedRegion } from '$lib/audio/suggest/types';
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
		discardLocalFile,
		collectSelectionAsLocalFile,
		onTakeInventoryChanged,
		onUploadQueueChanged,
		renameTakeDisplayName,
		saveTakeEditRecipe,
		saveTakeMetadata,
		uploadQueue
	} from '$lib/state';
	import BackButton from '$lib/ui/components/BackButton.svelte';
	import ConfirmDialog from '$lib/ui/components/ConfirmDialog.svelte';
	import EmptyState from '$lib/ui/components/EmptyState.svelte';
	import GhostButton from '$lib/ui/components/GhostButton.svelte';
	import SheetOverlay from '$lib/ui/components/SheetOverlay.svelte';
	import FieldNotesEditor from '$lib/ui/components/FieldNotesEditor.svelte';
	import PlaybackControl from '$lib/ui/components/PlaybackControl.svelte';
	import PrimaryButton from '$lib/ui/components/PrimaryButton.svelte';
	import SpecimenMark from '$lib/ui/components/SpecimenMark.svelte';
	import StatusLabel from '$lib/ui/components/StatusLabel.svelte';
	import AppShell from '$lib/ui/layouts/AppShell.svelte';
	import WaveformOverview from '$lib/ui/waveform/WaveformOverview.svelte';
	import { Icon } from '$lib/ui/icons';

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
	let savingFieldNotes = $state(false);
	let fieldNotesSheetOpen = $state(false);
	let loopPreview = $state(false);
	let discardConfirmOpen = $state(false);
	let discarding = $state(false);

	type SuggestionStatus = 'idle' | 'running' | 'ready' | 'empty' | 'error';
	let suggestionStatus = $state<SuggestionStatus>('idle');
	let suggestions = $state.raw<SuggestedRegion[]>([]);
	/** null until the user engages prev/next or the count control. */
	let suggestionIndex = $state<number | null>(null);
	let suggestGeneration = 0;
	let showManualAnalyze = $state(false);

	const uploadJob = $derived(take ? uploadQueue.byTakeId[take.id] : undefined);

	const uploadLocked = $derived(
		take != null &&
			(isActiveTakeUploadState(take.uploadState) ||
				(uploadJob != null && isActiveUploadJobState(uploadJob.state)))
	);

	const sourceDuration = $derived(peaks?.durationSeconds || take?.source.durationSeconds || 0);

	const currentRecipe = $derived.by(() => {
		void historyEpoch;
		return editHistory?.current ?? take?.editRecipe ?? null;
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

	/** Collect commits the retained trim result, not a temporary waveform selection. */
	const hasUsableTrim = $derived(
		currentRecipe != null && collectableRetainedBounds(currentRecipe, sourceDuration) != null
	);

	const suggestionEligible = $derived(isEligibleForSuggestedRegions(sourceDuration));
	const suggestionCount = $derived(suggestions.length);
	const showSuggestionChrome = $derived(suggestionStatus === 'ready' && suggestionCount > 0);
	/** Next only after the user engages the scouted control (selects first). */
	const showSuggestionNext = $derived(showSuggestionChrome && suggestionIndex != null);
	const suggestionLabel = $derived.by(() => {
		if (suggestionIndex == null) {
			return suggestionCount === 1 ? '1 scouted' : `${suggestionCount} scouted`;
		}
		const current = String(suggestionIndex + 1).padStart(2, '0');
		const total = String(suggestionCount).padStart(2, '0');
		return `${current}/${total}`;
	});
	/** Map markers only while navigating scouted regions. */
	const scoutedRegionsForWave = $derived(suggestionIndex != null ? suggestions : null);

	function clearSuggestions() {
		suggestGeneration += 1;
		suggestionStatus = 'idle';
		suggestions = [];
		suggestionIndex = null;
		showManualAnalyze = false;
	}

	function applySuggestionAt(index: number) {
		if (uploadLocked) return;
		const region = suggestions[index];
		if (!region) return;
		suggestionIndex = index;
		selectionStart = region.startSeconds;
		selectionEnd = region.endSeconds;
		if (playing) {
			playback?.pause();
			playing = false;
			stopPlayheadLoop();
		}
		onSeek(region.startSeconds);
	}

	/** First click engages: select scouted 0 and reveal Next. Click again exits scouted mode. */
	function onSuggestionScoutedActivate() {
		if (!showSuggestionChrome || suggestionCount === 0) return;
		if (suggestionIndex != null) {
			suggestionIndex = null;
			return;
		}
		applySuggestionAt(0);
	}

	function onSuggestionNext() {
		if (!showSuggestionNext || suggestionCount === 0 || suggestionIndex == null) return;
		applySuggestionAt((suggestionIndex + 1) % suggestionCount);
	}

	async function runSuggestedRegions(options?: { force?: boolean }) {
		const current = take;
		if (!current || !suggestionEligible) {
			clearSuggestions();
			return;
		}

		const generation = ++suggestGeneration;
		suggestionStatus = 'running';
		showManualAnalyze = false;

		try {
			const pcm = await ensureDetailPcm();
			if (generation !== suggestGeneration || take?.id !== current.id) return;

			const result = await ensureSuggestedRegionsForTake(current, {
				force: options?.force,
				pcm
			});
			if (generation !== suggestGeneration || take?.id !== current.id) return;

			suggestions = result.regions;
			if (
				suggestionIndex == null ||
				suggestionIndex < 0 ||
				suggestionIndex >= result.regions.length
			) {
				suggestionIndex = null;
			}
			if (result.regions.length === 0) {
				suggestionStatus = 'empty';
				showManualAnalyze = false;
			} else {
				suggestionStatus = 'ready';
			}
		} catch (cause) {
			console.error('[SampleScout] suggested regions failed', cause);
			if (generation !== suggestGeneration || take?.id !== current.id) return;
			suggestions = [];
			suggestionIndex = null;
			suggestionStatus = 'error';
			showManualAnalyze = suggestionEligible;
		}
	}

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

	function onSelectionGestureEnd(start: number, end: number) {
		const lo = Math.min(start, end);
		const hi = Math.max(start, end);
		if (hi - lo < MIN_SEGMENT_SECONDS) return;
		if (playing) {
			playback?.pause();
			playing = false;
			stopPlayheadLoop();
		}
		onSeek(lo);
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
		if (!take || !editHistory || uploadLocked) return false;
		try {
			const next = mutate(editHistory.current);
			const committed = editHistory.commit(next);
			bumpHistory();
			await persistRecipe(committed);
			if (feedback) actionToast.show(feedback);
			return true;
		} catch (cause) {
			const message =
				cause instanceof Error && cause.message.trim() ? cause.message : 'Could not apply edit';
			actionToast.show(message);
			return false;
		}
	}

	async function onTrim() {
		if (!hasUsableSelection || selectionStart == null || selectionEnd == null) return;
		const start = selectionStart;
		const end = selectionEnd;
		const ok = await applyRecipeMutation(
			(recipe) => trimToSelection(recipe, start, end),
			'Trim applied'
		);
		if (ok) {
			selectionStart = null;
			selectionEnd = null;
		}
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

	async function onCollect() {
		if (uploadLocked) return;
		if (!take || !editHistory || !currentRecipe || sourceDuration <= 0) return;
		const bounds = collectableRetainedBounds(currentRecipe, sourceDuration);
		if (!bounds) return;
		try {
			await collectSelectionAsLocalFile({
				parentTakeId: take.id,
				startSeconds: bounds.start,
				endSeconds: bounds.end
			});
			selectionStart = null;
			selectionEnd = null;
			// Return parent to full-source identity so the next region can be trimmed and collected.
			const next = editHistory.resetToIdentity(sourceDuration);
			bumpHistory();
			await persistRecipe(next);
		} catch (cause) {
			const message =
				cause && typeof cause === 'object' && 'message' in cause
					? String((cause as { message: string }).message)
					: cause instanceof Error
						? cause.message
						: 'Could not collect trim';
			actionToast.show(message.trim() || 'Could not collect trim');
		}
	}

	async function onNormalize() {
		await applyRecipeMutation((recipe) => enablePeakNormalization(recipe), 'Normalize applied');
	}

	async function onResetEdits() {
		if (!take || !editHistory || sourceDuration <= 0 || uploadLocked) return;
		try {
			const next = editHistory.resetToIdentity(sourceDuration);
			bumpHistory();
			await persistRecipe(next);
			actionToast.show('Edits reset');
		} catch (cause) {
			const message =
				cause instanceof Error && cause.message.trim() ? cause.message : 'Could not reset edits';
			actionToast.show(message);
		}
	}

	async function loadTake(id: string) {
		if (detailPcmTakeId && detailPcmTakeId !== id) {
			clearDetailPcmCache();
			clearSuggestions();
		}
		const foundTake = await getTake(id);
		if (foundTake && foundTake.lifecycleState === 'saved') {
			take = foundTake;
			draftName = foundTake.metadata.displayName;
			error = null;
			syncHistoryFromTake(foundTake);
		} else if (foundTake) {
			take = null;
			clearHistory();
			clearSuggestions();
			error = 'Take is no longer available';
		} else {
			take = null;
			clearHistory();
			clearSuggestions();
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
			void runSuggestedRegions();
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
			clearSuggestions();
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

	/** Playback-timeline bounds for selection preview (edited seconds when recipe is non-identity). */
	function getSelectionPlaybackBoundsEdited(): { start: number; end: number } | null {
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
		const bounds = getSelectionPlaybackBoundsEdited();
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

			if (playing) {
				if (hasUsableSelection) {
					const bounds = getSelectionPlaybackBoundsEdited();
					if (bounds && currentTime >= bounds.end - 0.002) {
						if (loopPreview) {
							playback.seek(bounds.start);
							syncPlayheadFromHandle(playback);
						} else {
							playback.pause();
							playing = false;
							syncPlayheadFromHandle(playback);
							stopPlayheadLoop();
							return;
						}
					}
				}

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
		clearSuggestions();
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

	function toggleFieldNotesSheet() {
		fieldNotesSheetOpen = !fieldNotesSheetOpen;
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

			if (hasUsableSelection) {
				const bounds = getSelectionPlaybackBoundsEdited();
				if (bounds) {
					const outside = currentTime < bounds.start - 0.001 || currentTime >= bounds.end - 0.002;
					if (outside) {
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

	function isEditableKeyboardTarget(target: EventTarget | null): boolean {
		if (!(target instanceof Element)) return false;
		if (target instanceof HTMLElement && target.isContentEditable) return true;
		return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
	}

	/** Space toggles play/pause unless focus is in a field, control, or modal surface. */
	function onWindowKeydown(event: KeyboardEvent) {
		if (event.code !== 'Space' && event.key !== ' ') return;
		if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
		if (loading || !take?.source.fileRef) return;
		if (editingName || fieldNotesSheetOpen || discardConfirmOpen) return;
		if (isEditableKeyboardTarget(event.target)) return;
		const el = event.target instanceof Element ? event.target : null;
		if (el?.closest('button, [role="button"], a, summary')) return;

		event.preventDefault();
		void togglePlayback();
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
		if (!take || !editingName || uploadLocked) return;
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
		if (!take || discarding || uploadLocked) return;
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
			await discardLocalFile(id);
			discardConfirmOpen = false;
			fieldNotesSheetOpen = false;
			await goto(resolve('/collection'));
		} finally {
			discarding = false;
		}
	}

	async function onSaveFieldNotes(patch: TakeMetadataPatch) {
		if (!take || savingFieldNotes || uploadLocked) return;
		savingFieldNotes = true;
		try {
			take = await saveTakeMetadata(take.id, patch);
			draftName = take.metadata.displayName;
			actionToast.show('Field Notes saved');
		} catch (cause) {
			const message =
				cause && typeof cause === 'object' && 'message' in cause
					? String((cause as { message: string }).message)
					: 'Could not save Field Notes';
			actionToast.show(message.trim() || 'Could not save Field Notes');
		} finally {
			savingFieldNotes = false;
		}
	}

	const displayName = $derived(take?.metadata.displayName || `Take ${takeId.slice(0, 8)}`);
</script>

<svelte:head>
	<title>{displayName} · SampleScout</title>
</svelte:head>

<svelte:window onkeydown={onWindowKeydown} />

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
					window.location.assign(resolve('/collection'));
				}}
			/>
		</section>
	{:else if take}
		<section class="workspace">
			<header class="editor-header">
				<div class="header-start">
					<BackButton href={resolve('/collection')} label="Collection" />
					<SpecimenMark mark={deriveSpecimenMark(take)} size="editor" />
				</div>
				<div class="title-slot">
					{#if editingName && !uploadLocked}
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
						<button
							type="button"
							class="take-title"
							disabled={uploadLocked}
							onclick={() => {
								if (uploadLocked) return;
								editingName = true;
							}}
						>
							{displayName}
						</button>
					{/if}
				</div>
				<div class="header-end">
					<GhostButton
						icon
						disabled={uploadLocked || identity}
						onclick={() => void onResetEdits()}
						aria-label="Reset edits"
						title="Reset edits"
					>
						<Icon name="reset" />
					</GhostButton>
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
						scoutedRegions={scoutedRegionsForWave}
						peakNormalization={currentRecipe?.peakNormalization}
						{onSeek}
						{onSelectionChange}
						{onSelectionGestureEnd}
						{onTrimBoundaryCommit}
						{onFadeBoundaryCommit}
						editsLocked={uploadLocked}
						onRetry={() => {
							const current = take;
							if (current) void loadPeaks(current);
						}}
					>
						{#snippet chromeActions()}
							<GhostButton compact disabled={uploadLocked} onclick={() => void onNormalize()}>
								Normalize
							</GhostButton>
							<GhostButton
								compact
								disabled={uploadLocked || !hasUsableSelection}
								onclick={() => void onTrim()}
							>
								Trim
							</GhostButton>
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
						<div class="transport-row">
							<div class="transport-side" aria-hidden="true"></div>
							<div class="transport-center">
								<PlaybackControl {playing} onclick={() => void togglePlayback()} />
							</div>
							<div class="transport-side transport-side-end">
								<GhostButton
									icon
									active={loopPreview}
									aria-label="Loop"
									aria-pressed={loopPreview}
									title="Loop"
									onclick={() => {
										loopPreview = !loopPreview;
									}}
								>
									<Icon name="loop" size={18} />
								</GhostButton>
							</div>
						</div>
						<div class="action-row">
							<div class="action-side">
								{#if showSuggestionChrome}
									<div class="suggest-nav" role="group" aria-label="Scouted regions">
										<GhostButton
											compact
											active={suggestionIndex != null}
											disabled={uploadLocked}
											aria-pressed={suggestionIndex != null}
											aria-label={suggestionIndex == null
												? suggestionLabel
												: `Scouted region ${suggestionLabel}`}
											title={suggestionLabel}
											onclick={onSuggestionScoutedActivate}
										>
											<span class="suggest-count-face">
												<Icon name="collection" size={16} />
												{suggestionLabel}
											</span>
										</GhostButton>
										{#if showSuggestionNext}
											<GhostButton
												compact
												disabled={uploadLocked}
												aria-label="Next scouted region"
												title="Next"
												onclick={onSuggestionNext}
											>
												Next
											</GhostButton>
										{/if}
									</div>
								{:else if showManualAnalyze && suggestionEligible}
									<GhostButton
										icon
										disabled={uploadLocked || suggestionStatus === 'running'}
										aria-label="Analyze scouted regions"
										title="Analyze"
										onclick={() => void runSuggestedRegions({ force: true })}
									>
										<Icon name="collection" size={18} />
									</GhostButton>
								{/if}
							</div>
							<div class="action-side action-side-end">
								<GhostButton
									icon
									active={fieldNotesSheetOpen}
									onclick={toggleFieldNotesSheet}
									aria-label="Field Notes"
									aria-expanded={fieldNotesSheetOpen}
									aria-haspopup="dialog"
								>
									<Icon name="field-notes" />
								</GhostButton>
								<PrimaryButton
									disabled={uploadLocked || !hasUsableTrim}
									onclick={() => void onCollect()}
								>
									Collect
								</PrimaryButton>
							</div>
						</div>
					</div>
				</div>
			</div>
		</section>

		{#if fieldNotesSheetOpen}
			<SheetOverlay title="Field Notes" onclose={() => (fieldNotesSheetOpen = false)}>
				<div class="editor-tools">
					<section class="field-notes-section" aria-label="Field Notes">
						<div class="catalog-summary">
							<SpecimenMark mark={deriveSpecimenMark(take)} />
							<div>
								<span class="metadata-label">Local catalog reference</span>
								<strong class="catalog-reference">{deriveCatalogReference(take)}</strong>
							</div>
						</div>

						<FieldNotesEditor
							metadata={take.metadata}
							disabled={uploadLocked}
							saving={savingFieldNotes}
							onsave={onSaveFieldNotes}
						/>

						<div class="metadata-grid">
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
									<span class="metadata-label">Collected from</span>
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
									<StatusLabel tone={isTakeSavedLocally(take) ? 'signal' : 'muted'}>
										{isTakeSavedLocally(take) ? 'LOCAL FILE · THIS DEVICE' : 'Not saved'}
									</StatusLabel>
								{/if}
							</div>
						</div>
					</section>

					<div class="danger-row">
						<GhostButton
							icon
							danger
							disabled={uploadLocked}
							onclick={requestDiscard}
							aria-label="Discard take"
							title="Discard"
						>
							<Icon name="trash" />
						</GhostButton>
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
		overscroll-behavior: none;
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
		padding: var(--space-2);
		border-bottom: 1px solid var(--line);
		background: var(--paper);
		z-index: 1;
	}

	.header-start {
		display: flex;
		align-items: center;
		justify-content: flex-start;
		justify-self: start;
		gap: var(--space-2);
		min-width: var(--touch-min);
		min-height: var(--touch-min);
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
		gap: var(--space-2);
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
		cursor: default;
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

	.take-title:disabled {
		cursor: default;
		opacity: 0.7;
		text-decoration: none;
	}

	.take-title:disabled:hover {
		text-decoration: none;
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
		padding: var(--space-2) var(--page-gutter);
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
	}

	.danger-row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		padding-top: var(--space-2);
		border-top: 1px solid var(--line);
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
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-2) var(--page-gutter);
		padding-bottom: calc(var(--space-2) + env(safe-area-inset-bottom, 0px));
		background: var(--paper);
	}

	.transport-row {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: start;
		width: 100%;
	}

	.transport-center {
		display: flex;
		justify-content: center;
	}

	.transport-side {
		display: grid;
		align-items: center;
		justify-items: start;
		/* Match PlaybackControl height so Loop centers on the well. */
		min-height: calc(var(--space-7) + var(--space-5) + var(--space-2) * 2);
	}

	.transport-side-end {
		/* Sit just to the right of play — not at the page edge. */
		justify-items: start;
		padding-left: var(--space-3);
	}

	.suggest-nav {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: var(--touch-min);
	}

	.suggest-count-face {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-variant-numeric: tabular-nums;
		text-transform: lowercase;
	}

	.action-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		width: 100%;
	}

	.action-side {
		display: flex;
		align-items: center;
		justify-content: flex-start;
	}

	.action-side-end {
		justify-content: flex-end;
		gap: var(--space-2);
	}
</style>
