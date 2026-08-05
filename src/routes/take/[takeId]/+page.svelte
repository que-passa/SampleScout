<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getTake, getAppSettings, rememberRecentTagsFromUse } from '$lib/persistence';
	import {
		EditRecipeHistory,
		MIN_SEGMENT_SECONDS,
		adjustRetainedBoundary,
		applyFadeIn,
		applyFadeOut,
		collectableRetainedBounds,
		commitNormalizeIfNeeded,
		cycleHighPassHz,
		cycleRecipeGainDb,
		deriveCatalogReference,
		deriveSpecimenMark,
		disablePeakNormalization,
		enablePeakNormalization,
		formatShortDateTime,
		formatUploadStateLabel,
		isActiveTakeUploadState,
		isActiveUploadJobState,
		isIdentityRecipe,
		isTakeSavedLocally,
		normalizeEditRecipeProcessing,
		recipeDurationSeconds,
		recipeFromWorkingRegion,
		retainedSourceRanges,
		toggleGate,
		toggleSoftLimit,
		uploadStateTone,
		type EditRecipe,
		type Take,
		type TakeMetadataPatch
	} from '$lib/domain';
	import { ensurePeaksForTake, type LoadedPeaks } from '$lib/audio/peaks';
	import {
		ensureSuggestedRegionsForTake,
		isEligibleForSuggestedRegions,
		isSuggestAutoDisabledForSession
	} from '$lib/audio/suggest/ensure';
	import type { SuggestedRegion } from '$lib/audio/suggest/types';
	import { readBinary } from '$lib/persistence/opfs';
	import { decodeAudioPlanar, type DecodedPlanarAudio } from '$lib/audio/decode';
	import { recipeNormalizeGainDb, renderRecipePlanar } from '$lib/audio/render';
	import {
		createPlaybackFromFileRef,
		createPlaybackFromRenderedPlanar,
		type PlaybackHandle
	} from '$lib/audio/playback';
	import {
		actionToast,
		discardLocalFile,
		collectSelectionAsLocalFile,
		onGeneratedTagsApplied,
		onTakeInventoryChanged,
		onUploadQueueChanged,
		renameTakeDisplayName,
		saveTakeEditRecipe,
		saveTakeMetadata,
		scheduleGeneratedTagsForTake,
		uploadQueue
	} from '$lib/state';
	import BackButton from '$lib/ui/components/BackButton.svelte';
	import ConfirmDialog from '$lib/ui/components/ConfirmDialog.svelte';
	import EmptyState from '$lib/ui/components/EmptyState.svelte';
	import FeedbackButton from '$lib/ui/components/FeedbackButton.svelte';
	import GhostButton from '$lib/ui/components/GhostButton.svelte';
	import SheetOverlay from '$lib/ui/components/SheetOverlay.svelte';
	import FieldNotesEditor from '$lib/ui/components/FieldNotesEditor.svelte';
	import PlaybackControl from '$lib/ui/components/PlaybackControl.svelte';
	import PrimaryButton from '$lib/ui/components/PrimaryButton.svelte';
	import SpecimenMark from '$lib/ui/components/SpecimenMark.svelte';
	import StatusLabel from '$lib/ui/components/StatusLabel.svelte';
	import StaticFact from '$lib/ui/components/StaticFact.svelte';
	import StaticFactsGrid from '$lib/ui/components/StaticFactsGrid.svelte';
	import AppShell from '$lib/ui/layouts/AppShell.svelte';
	import WaveformOverview from '$lib/ui/waveform/WaveformOverview.svelte';
	import { Icon } from '$lib/ui/icons';

	const takeId = $derived(page.params.takeId ?? '');

	let take = $state<Take | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let playback = $state<PlaybackHandle | null>(null);
	let playbackRecipeKey = $state<string | null>(null);
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
	/** Fades on the working selection (Collect loop); not persisted until Collect. */
	let selectionFadeIn = $state(0);
	let selectionFadeOut = $state(0);
	let savingFieldNotes = $state(false);
	let fieldNotesCanSave = $state(false);
	let fieldNotesSheetOpen = $state(false);
	let recentTags = $state<string[]>([]);
	let loopPreview = $state(false);
	let discardConfirmOpen = $state(false);
	let discarding = $state(false);

	type SuggestionStatus = 'idle' | 'running' | 'ready' | 'empty' | 'error';
	let suggestionStatus = $state<SuggestionStatus>('idle');
	let suggestions = $state.raw<SuggestedRegion[]>([]);
	/** null until the user engages Next/Previous or the count control. */
	let suggestionIndex = $state<number | null>(null);
	let suggestGeneration = 0;
	let suggestAbort: AbortController | null = null;
	let showManualAnalyze = $state(false);
	/** One polite SR announcement when N ≥ 1 becomes available — not per analysis frame. */
	let suggestionLiveMessage = $state('');
	/** Identity take with no selection: peak-normalize preview on until the user turns it off. */
	let normalizePreviewSuppressed = $state(false);
	let normalizeGainDb = $state<number | null>(null);

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

	const hasUsableSelection = $derived(
		selectionStart != null &&
			selectionEnd != null &&
			Math.abs(selectionEnd - selectionStart) >= MIN_SEGMENT_SECONDS
	);

	/** Wave retained chrome: working selection, else committed recipe on non-identity takes. */
	const waveRetainedRanges = $derived.by(() => {
		if (hasUsableSelection && selectionStart != null && selectionEnd != null) {
			const start = Math.min(selectionStart, selectionEnd);
			const end = Math.max(selectionStart, selectionEnd);
			return [
				{
					start,
					end,
					fadeInSeconds: selectionFadeIn,
					fadeOutSeconds: selectionFadeOut
				}
			];
		}
		if (!identity && currentRecipe) return retainedSourceRanges(currentRecipe);
		return undefined;
	});

	const workingRecipe = $derived.by((): EditRecipe | null => {
		if (!hasUsableSelection || selectionStart == null || selectionEnd == null) return null;
		try {
			return recipeFromWorkingRegion({
				startSeconds: selectionStart,
				endSeconds: selectionEnd,
				fadeInSeconds: selectionFadeIn,
				fadeOutSeconds: selectionFadeOut,
				gainDb: currentRecipe?.segments[0]?.gainDb ?? 0,
				processing: currentRecipe?.processing
			});
		} catch {
			return null;
		}
	});

	const identityNormalizePreview = $derived(
		identity &&
			!hasUsableSelection &&
			!normalizePreviewSuppressed &&
			currentRecipe?.peakNormalization?.enabled !== true
	);

	const normalizePreviewRecipe = $derived.by((): EditRecipe | null => {
		if (!identityNormalizePreview || sourceDuration <= 0) return null;
		return recipeFromWorkingRegion({
			startSeconds: 0,
			endSeconds: sourceDuration,
			gainDb: currentRecipe?.segments[0]?.gainDb ?? 0,
			processing: currentRecipe?.processing
		});
	});

	/** Playback / preview follows the working selection when present. */
	const activePlaybackRecipe = $derived(workingRecipe ?? normalizePreviewRecipe ?? currentRecipe);

	const useRawFilePlayback = $derived(
		identity && !hasUsableSelection && normalizePreviewRecipe == null
	);

	const wavePreviewRecipe = $derived(useRawFilePlayback ? null : activePlaybackRecipe);

	const recipeGainDb = $derived(currentRecipe?.segments[0]?.gainDb ?? 0);
	const recipeProcessing = $derived(normalizeEditRecipeProcessing(currentRecipe?.processing));
	const gainActive = $derived(Math.abs(recipeGainDb) > 1e-9);
	const rumbleActive = $derived(recipeProcessing.highPassHz > 0);
	const limitActive = $derived(recipeProcessing.softLimitEnabled);
	const gateActive = $derived(recipeProcessing.gateEnabled);

	function formatGainLabel(db: number): string {
		if (Math.abs(db) <= 1e-9) return 'Gain';
		const rounded = Math.round(db);
		return rounded > 0 ? `+${rounded} dB` : `${rounded} dB`;
	}

	function formatRumbleLabel(hz: number): string {
		return hz > 0 ? `${hz} Hz` : 'Rumble';
	}

	function formatNormalizeLabel(db: number | null): string {
		if (db == null) return 'Normalize';
		const rounded = Math.round(db * 10) / 10;
		const sign = rounded > 0 ? '+' : '';
		return `Norm ${sign}${rounded} dB`;
	}

	function formatNormalizeTitle(db: number | null): string {
		if (!normalizeOn) return 'Peak normalize to −1 dBFS';
		if (db == null) return 'Peak normalize on';
		const rounded = Math.round(db * 10) / 10;
		const sign = rounded > 0 ? '+' : '';
		return `Peak normalize ${sign}${rounded} dB to −1 dBFS`;
	}

	const showTrimGrips = $derived(!hasUsableSelection && !identity);

	const wavePeakNormalization = $derived(
		workingRecipe?.peakNormalization ??
			normalizePreviewRecipe?.peakNormalization ??
			currentRecipe?.peakNormalization
	);

	const normalizeOn = $derived(
		(workingRecipe?.peakNormalization?.enabled ??
			normalizePreviewRecipe?.peakNormalization?.enabled ??
			currentRecipe?.peakNormalization?.enabled) === true
	);

	/** Collect from a usable selection (scouted or manual). */
	const canCollect = $derived(
		hasUsableSelection &&
			workingRecipe != null &&
			sourceDuration > 0 &&
			collectableRetainedBounds(workingRecipe, sourceDuration) != null
	);

	const suggestionEligible = $derived(isEligibleForSuggestedRegions(sourceDuration));
	const suggestionCount = $derived(suggestions.length);
	const showSuggestionChrome = $derived(suggestionStatus === 'ready' && suggestionCount > 0);
	/** Next/Previous only after the user engages the scouted control (selects first). */
	const showSuggestionNav = $derived(showSuggestionChrome && suggestionIndex != null);
	const suggestionLabel = $derived.by(() => {
		if (suggestionIndex == null) {
			return suggestionCount === 1 ? '1 scouted' : `${suggestionCount} scouted`;
		}
		const current = String(suggestionIndex + 1).padStart(2, '0');
		const total = String(suggestionCount).padStart(2, '0');
		return `${current}/${total}`;
	});
	/** Visible chrome says “scouted”; SR labels use fuller “suggested regions”. */
	const suggestionAriaLabel = $derived.by(() => {
		if (suggestionIndex == null) {
			return suggestionCount === 1
				? '1 suggested region'
				: `${suggestionCount} suggested regions`;
		}
		return `Suggested region ${suggestionLabel}`;
	});
	/** Map markers only while navigating scouted regions. */
	const scoutedRegionsForWave = $derived(suggestionIndex != null ? suggestions : null);

	function announceSuggestionsAvailable(count: number) {
		suggestionLiveMessage =
			count === 1 ? '1 suggested region available' : `${count} suggested regions available`;
	}

	function clearSuggestions() {
		suggestGeneration += 1;
		suggestAbort?.abort();
		suggestAbort = null;
		suggestionStatus = 'idle';
		suggestions = [];
		suggestionIndex = null;
		showManualAnalyze = false;
		suggestionLiveMessage = '';
	}

	function clearSelectionFades() {
		selectionFadeIn = 0;
		selectionFadeOut = 0;
	}

	function clampSelectionFades(start: number, end: number) {
		const length = Math.max(0, end - start);
		let fadeIn = Math.max(0, selectionFadeIn);
		let fadeOut = Math.max(0, selectionFadeOut);
		const sum = fadeIn + fadeOut;
		if (sum > length && sum > 0) {
			const scale = length / sum;
			fadeIn *= scale;
			fadeOut *= scale;
		}
		selectionFadeIn = Math.min(fadeIn, length);
		selectionFadeOut = Math.min(fadeOut, length);
	}

	function applySuggestionAt(index: number) {
		if (uploadLocked) return;
		const region = suggestions[index];
		if (!region) return;
		suggestionIndex = index;
		selectionStart = region.startSeconds;
		selectionEnd = region.endSeconds;
		clearSelectionFades();
		disposePlayback();
		onSeek(region.startSeconds);
	}

	/** First click engages: select scouted 0 and reveal Previous/Next. Click again exits scouted mode. */
	function onSuggestionScoutedActivate() {
		if (!showSuggestionChrome || suggestionCount === 0 || uploadLocked) return;
		if (suggestionIndex != null) {
			suggestionIndex = null;
			return;
		}
		applySuggestionAt(0);
	}

	function onSuggestionPrev() {
		if (!showSuggestionNav || suggestionCount === 0 || suggestionIndex == null) return;
		applySuggestionAt((suggestionIndex - 1 + suggestionCount) % suggestionCount);
	}

	function onSuggestionNext() {
		if (!showSuggestionNav || suggestionCount === 0 || suggestionIndex == null) return;
		applySuggestionAt((suggestionIndex + 1) % suggestionCount);
	}

	async function runSuggestedRegions(options?: { force?: boolean }) {
		const current = take;
		if (!current || !suggestionEligible) {
			clearSuggestions();
			return;
		}

		const generation = ++suggestGeneration;
		suggestAbort?.abort();
		const abort = new AbortController();
		suggestAbort = abort;
		suggestionStatus = 'running';
		showManualAnalyze = false;
		suggestionLiveMessage = '';

		try {
			const needsPcm = options?.force === true || !isSuggestAutoDisabledForSession();
			const pcm = needsPcm ? await ensureDetailPcm() : null;
			if (generation !== suggestGeneration || take?.id !== current.id || abort.signal.aborted) {
				return;
			}

			const result = await ensureSuggestedRegionsForTake(current, {
				force: options?.force,
				pcm,
				signal: abort.signal
			});
			if (generation !== suggestGeneration || take?.id !== current.id) return;

			if (result.autoSkipped) {
				suggestions = [];
				suggestionIndex = null;
				suggestionStatus = 'idle';
				showManualAnalyze = suggestionEligible;
				suggestionLiveMessage = '';
				return;
			}

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
				suggestionLiveMessage = '';
			} else {
				suggestionStatus = 'ready';
				announceSuggestionsAvailable(result.regions.length);
			}
		} catch (cause) {
			if (generation !== suggestGeneration || take?.id !== current.id) return;
			const aborted =
				abort.signal.aborted ||
				(cause instanceof DOMException && cause.name === 'AbortError') ||
				(cause instanceof Error && cause.name === 'AbortError');
			if (aborted) {
				suggestionStatus = 'idle';
				return;
			}
			console.error('[SampleScout] suggested regions failed', cause);
			suggestions = [];
			suggestionIndex = null;
			suggestionStatus = 'error';
			showManualAnalyze = suggestionEligible;
			suggestionLiveMessage = '';
		} finally {
			if (suggestAbort === abort) suggestAbort = null;
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
		clampSelectionFades(Math.min(start, end), Math.max(start, end));
	}

	function onSelectionGestureEnd(start: number, end: number) {
		const lo = Math.min(start, end);
		const hi = Math.max(start, end);
		if (hi - lo < MIN_SEGMENT_SECONDS) return;
		clampSelectionFades(lo, hi);
		disposePlayback();
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
		feedback?: string,
		options?: { carryNormalizePreview?: boolean }
	): Promise<boolean> {
		if (!take || !editHistory || uploadLocked) return false;
		try {
			const current = editHistory.current;
			const carryNormalize =
				options?.carryNormalizePreview === true &&
				sourceDuration > 0 &&
				isIdentityRecipe(current, sourceDuration) &&
				!normalizePreviewSuppressed &&
				current.peakNormalization?.enabled !== true;
			let next = mutate(current);
			if (carryNormalize) {
				next = commitNormalizeIfNeeded(next, {
					wasIdentity: true,
					hadNormalizePreview: true
				});
			}
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

	async function onTrimBoundaryCommit(detail: {
		rangeIndex: number;
		edge: 'start' | 'end';
		seconds: number;
	}) {
		if (hasUsableSelection) return;
		await applyRecipeMutation((recipe) =>
			adjustRetainedBoundary(recipe, detail.rangeIndex, detail.edge, detail.seconds, sourceDuration)
		);
	}

	async function onFadeBoundaryCommit(detail: { edge: 'in' | 'out'; seconds: number }) {
		if (hasUsableSelection) {
			if (detail.edge === 'in') selectionFadeIn = Math.max(0, detail.seconds);
			else selectionFadeOut = Math.max(0, detail.seconds);
			if (selectionStart != null && selectionEnd != null) {
				clampSelectionFades(
					Math.min(selectionStart, selectionEnd),
					Math.max(selectionStart, selectionEnd)
				);
			}
			disposePlayback();
			return;
		}
		await applyRecipeMutation((recipe) =>
			detail.edge === 'in'
				? applyFadeIn(recipe, detail.seconds)
				: applyFadeOut(recipe, detail.seconds)
		);
	}

	async function onCollect() {
		if (uploadLocked) return;
		if (!take || !editHistory || !workingRecipe || sourceDuration <= 0) return;
		if (!canCollect) return;
		const nextSuggestionIndex =
			suggestionIndex != null && suggestions.length > 0
				? (suggestionIndex + 1) % suggestions.length
				: null;
		try {
			await collectSelectionAsLocalFile({
				parentTakeId: take.id,
				recipe: workingRecipe
			});
			// Return parent to full-source identity so the next region can be selected and collected.
			const next = editHistory.resetToIdentity(sourceDuration);
			bumpHistory();
			await persistRecipe(next);
			if (nextSuggestionIndex != null) {
				applySuggestionAt(nextSuggestionIndex);
				return;
			}
			selectionStart = null;
			selectionEnd = null;
			clearSelectionFades();
		} catch (cause) {
			const message =
				cause && typeof cause === 'object' && 'message' in cause
					? String((cause as { message: string }).message)
					: cause instanceof Error
						? cause.message
						: 'Could not collect region';
			actionToast.show(message.trim() || 'Could not collect region');
		}
	}

	async function onNormalize() {
		if (uploadLocked) return;
		// Selection auto-enables normalize for Collect preview — locked on while selecting.
		if (hasUsableSelection) return;
		if (normalizeOn) {
			if (currentRecipe?.peakNormalization?.enabled) {
				await applyRecipeMutation((recipe) => disablePeakNormalization(recipe), 'Normalize off');
			}
			normalizePreviewSuppressed = true;
			disposePlayback();
			return;
		}
		normalizePreviewSuppressed = false;
		if (!identity) {
			await applyRecipeMutation((recipe) => enablePeakNormalization(recipe), 'Normalize applied');
			return;
		}
		disposePlayback();
	}

	async function onGain() {
		if (uploadLocked) return;
		await applyRecipeMutation((recipe) => cycleRecipeGainDb(recipe), 'Gain updated', {
			carryNormalizePreview: true
		});
	}

	async function onRumble() {
		if (uploadLocked) return;
		await applyRecipeMutation((recipe) => cycleHighPassHz(recipe), 'Rumble filter updated', {
			carryNormalizePreview: true
		});
	}

	async function onLimit() {
		if (uploadLocked || !normalizeOn) return;
		await applyRecipeMutation((recipe) => toggleSoftLimit(recipe), 'Limit updated', {
			carryNormalizePreview: true
		});
	}

	async function onGate() {
		if (uploadLocked) return;
		await applyRecipeMutation((recipe) => toggleGate(recipe), 'Gate updated', {
			carryNormalizePreview: true
		});
	}

	async function onResetEdits() {
		if (!take || !editHistory || sourceDuration <= 0 || uploadLocked) return;
		try {
			const next = editHistory.resetToIdentity(sourceDuration);
			bumpHistory();
			await persistRecipe(next);
			selectionStart = null;
			selectionEnd = null;
			clearSelectionFades();
			actionToast.show('Edits reset');
		} catch (cause) {
			const message =
				cause instanceof Error && cause.message.trim() ? cause.message : 'Could not reset edits';
			actionToast.show(message);
		}
	}

	async function loadTake(id: string) {
		normalizePreviewSuppressed = false;
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
			scheduleGeneratedTagsForTake(current, { pcm: loaded.decoded });
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

	/** Playback-timeline bounds (edited seconds of the active playback recipe). */
	function getSelectionPlaybackBoundsEdited(): { start: number; end: number } | null {
		if (!activePlaybackRecipe || transportDuration <= 0) return null;
		if (hasUsableSelection) {
			return { start: 0, end: transportDuration };
		}
		return { start: 0, end: transportDuration };
	}

	function syncPlayheadFromHandle(handle: PlaybackHandle) {
		if (!activePlaybackRecipe) return;
		currentTime = handle.getCurrentTime();
		const useSourceClock = useRawFilePlayback;
		displayPlayhead = useSourceClock
			? currentTime
			: editedTimeToSourceTime(activePlaybackRecipe, currentTime);
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
			if (!playback || !activePlaybackRecipe) return;
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
		const unsubTags = onGeneratedTagsApplied((updatedId) => {
			if (updatedId === id) {
				void loadTake(id);
			}
		});

		void (async () => {
			try {
				const settings = await getAppSettings();
				recentTags = settings.recentTags;
			} catch {
				recentTags = [];
			}
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
			unsubTags();
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

	$effect(() => {
		const recipe = activePlaybackRecipe;
		const on = normalizeOn;
		if (!on || !recipe?.peakNormalization?.enabled) {
			normalizeGainDb = null;
			return;
		}
		let cancelled = false;
		void ensureDetailPcm().then((pcm) => {
			if (cancelled || !pcm) return;
			normalizeGainDb = recipeNormalizeGainDb(pcm, recipe);
		});
		return () => {
			cancelled = true;
		};
	});

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

	const transportDuration = $derived(
		activePlaybackRecipe && (hasUsableSelection || !identity || normalizePreviewRecipe != null)
			? recipeDurationSeconds(activePlaybackRecipe)
			: sourceDuration
	);

	async function ensurePlayback(): Promise<PlaybackHandle | null> {
		if (!take?.source.fileRef || !activePlaybackRecipe) return null;

		const key = recipeKey(activePlaybackRecipe);
		if (playback && playbackRecipeKey === key) return playback;

		disposePlayback();

		let handle: PlaybackHandle;
		const useFile = useRawFilePlayback;
		if (useFile) {
			handle = await createPlaybackFromFileRef(take.source.fileRef, take.source.mimeType);
		} else {
			const file = await readBinary(take.source.fileRef);
			const planar = await decodeAudioPlanar(file, take.source.mimeType);
			const rendered = renderRecipePlanar(planar, activePlaybackRecipe);
			handle = await createPlaybackFromRenderedPlanar(rendered);
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
				if (!handle || !activePlaybackRecipe) return;
				const useSourceClock = useRawFilePlayback;
				const seekTime = useSourceClock
					? seconds
					: sourceTimeToEditedTime(activePlaybackRecipe, seconds);
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
			if (patch.tags) {
				void rememberRecentTagsFromUse(patch.tags)
					.then((settings) => {
						recentTags = settings.recentTags;
					})
					.catch(() => {});
			}
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
					<FeedbackButton />
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
						retainedRanges={waveRetainedRanges}
						scoutedRegions={scoutedRegionsForWave}
						peakNormalization={wavePeakNormalization}
						previewRecipe={wavePreviewRecipe}
						{showTrimGrips}
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
							<div class="wave-tool-actions bar-cluster-tight" role="group" aria-label="Edit tools">
								<GhostButton
									compact
									disabled={uploadLocked}
									active={gainActive}
									aria-pressed={gainActive}
									title="Cycle gain"
									onclick={() => void onGain()}
								>
									{formatGainLabel(recipeGainDb)}
								</GhostButton>
								<GhostButton
									compact
									disabled={uploadLocked}
									active={rumbleActive}
									aria-pressed={rumbleActive}
									title="Cycle rumble cut (high-pass)"
									onclick={() => void onRumble()}
								>
									{formatRumbleLabel(recipeProcessing.highPassHz)}
								</GhostButton>
								<GhostButton
									compact
									disabled={uploadLocked || !normalizeOn}
									active={limitActive}
									aria-pressed={limitActive}
									title={!normalizeOn
										? 'Turn on normalize before soft limit'
										: 'Soft limit at −1 dBFS'}
									onclick={() => void onLimit()}
								>
									Limit
								</GhostButton>
								<GhostButton
									compact
									disabled={uploadLocked}
									active={gateActive}
									aria-pressed={gateActive}
									title="Noise gate"
									onclick={() => void onGate()}
								>
									Gate
								</GhostButton>
								<GhostButton
									compact
									disabled={uploadLocked}
									active={normalizeOn}
									aria-pressed={normalizeOn}
									title={formatNormalizeTitle(normalizeGainDb)}
									onclick={() => void onNormalize()}
								>
									{normalizeOn ? formatNormalizeLabel(normalizeGainDb) : 'Normalize'}
								</GhostButton>
							</div>
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
						<div class="action-row bar-actions">
							<div class="action-side">
								<div class="sr-only" aria-live="polite">{suggestionLiveMessage}</div>
								{#if showSuggestionChrome}
									<div class="suggest-nav bar-cluster" role="group" aria-label="Suggested regions">
										<GhostButton
											compact
											disabled={uploadLocked}
											aria-label={suggestionAriaLabel}
											title={suggestionLabel}
											onclick={onSuggestionScoutedActivate}
										>
											<span class="suggest-count-face">
												<Icon name="collection" size={16} />
												{suggestionLabel}
											</span>
										</GhostButton>
										{#if showSuggestionNav}
											<GhostButton
												icon
												compact
												disabled={uploadLocked}
												aria-label="Previous suggested region"
												title="Previous"
												onclick={onSuggestionPrev}
											>
												<Icon name="back" />
											</GhostButton>
											<GhostButton
												icon
												compact
												disabled={uploadLocked}
												aria-label="Next suggested region"
												title="Next"
												onclick={onSuggestionNext}
											>
												<Icon name="next" />
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
							<div class="action-side action-side-end bar-cluster">
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
									disabled={uploadLocked || !canCollect}
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
				{#snippet footer()}
					<GhostButton danger disabled={uploadLocked} onclick={requestDiscard}>Discard</GhostButton>
					<PrimaryButton
						type="submit"
						form="take-field-notes-form"
						disabled={!fieldNotesCanSave || savingFieldNotes || uploadLocked}
					>
						{savingFieldNotes ? 'Saving…' : 'Save'}
					</PrimaryButton>
				{/snippet}
				<div class="editor-tools">
					<section class="field-notes-section" aria-label="Field Notes">
						<div class="catalog-summary">
							<SpecimenMark mark={deriveSpecimenMark(take)} />
							<div>
								<span class="catalog-label">Local catalog reference</span>
								<strong class="catalog-reference">{deriveCatalogReference(take)}</strong>
							</div>
						</div>

						<FieldNotesEditor
							formId="take-field-notes-form"
							bind:canSave={fieldNotesCanSave}
							metadata={take.metadata}
							takeId={take.id}
							{recentTags}
							disabled={uploadLocked}
							saving={savingFieldNotes}
							onsave={onSaveFieldNotes}
						/>

						<StaticFactsGrid>
							<StaticFact label="Duration">
								{formatClock(sourceDuration)}
							</StaticFact>

							{#if !identity}
								<StaticFact label="Edited" title="Edited duration">
									{formatClock(editedDuration)}
								</StaticFact>
							{/if}

							<StaticFact label="Channel">
								{channelLabel}
							</StaticFact>

							{#if selectionStart != null && selectionEnd != null}
								<StaticFact label="Selection">
									{formatClock(Math.min(selectionStart, selectionEnd))}–{formatClock(
										Math.max(selectionStart, selectionEnd)
									)}
								</StaticFact>
							{/if}

							{#if take.source.sourceType === 'import' && take.source.originalFileName}
								<StaticFact label="Source file" title="Original file">
									{take.source.originalFileName}
								</StaticFact>
							{/if}

							<StaticFact label="Format">
								{take.source.mimeType.replace(/^audio\//, '')}
							</StaticFact>

							<StaticFact label="Size">
								{Math.round(take.source.byteLength / 1024)} KB
							</StaticFact>

							<StaticFact label="Seq" title="Sequence">
								#{String(take.sequence).padStart(3, '0')}
							</StaticFact>

							<StaticFact label="Created">
								{formatShortDateTime(take.createdAt)}
							</StaticFact>

							<StaticFact label="Status" span={2}>
								{#if take.uploadState !== 'not-queued'}
									<StatusLabel tone={uploadStateTone(take.uploadState)} density="compact">
										{formatUploadStateLabel(take.uploadState)}
									</StatusLabel>
								{:else}
									<StatusLabel
										tone={isTakeSavedLocally(take) ? 'signal' : 'muted'}
										density="compact"
									>
										{isTakeSavedLocally(take) ? 'Local' : 'Not saved'}
									</StatusLabel>
								{/if}
							</StaticFact>
						</StaticFactsGrid>
					</section>
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
		flex-shrink: 0;
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
		flex-shrink: 0;
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

	.wave-tool-actions {
		flex-wrap: nowrap;
		flex-shrink: 0;
	}

	.wave-tool-actions > :global(*) {
		flex-shrink: 0;
	}

	.editor-tools {
		display: grid;
		gap: var(--space-3);
	}

	.field-notes-section {
		display: grid;
		gap: var(--space-3);
	}

	.catalog-summary {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding-bottom: var(--space-2);
		border-bottom: 1px solid var(--line);
		margin-bottom: var(--space-2);
	}

	.catalog-summary > div {
		display: grid;
		gap: 1px;
		min-width: 0;
	}

	.catalog-label {
		font-size: var(--text-micro);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ink-muted);
		line-height: 1.2;
	}

	.catalog-reference {
		overflow: hidden;
		font-size: var(--text-meta);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.transport-bar {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		/* Bottom inset comes from body safe-area padding — do not double it here. */
		padding: var(--space-2) var(--page-gutter);
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
		min-height: var(--touch-min);
	}

	.suggest-count-face {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		max-width: 100%;
		font-variant-numeric: tabular-nums;
		text-transform: lowercase;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.action-row {
		justify-content: space-between;
		width: 100%;
	}

	.action-side {
		display: flex;
		align-items: center;
		justify-content: flex-start;
		min-width: 0;
	}

	.action-side-end {
		justify-content: flex-end;
		flex-shrink: 0;
	}

	@media (max-width: 360px) {
		.editor-header {
			column-gap: var(--space-1);
			padding-inline: var(--space-1);
		}

		.header-start,
		.header-end {
			gap: var(--space-1);
		}

		.transport-bar {
			gap: var(--space-2);
			padding-inline: var(--space-2);
		}

		.action-row {
			gap: var(--space-1);
		}

		.suggest-nav {
			gap: var(--space-1);
		}
	}
</style>
