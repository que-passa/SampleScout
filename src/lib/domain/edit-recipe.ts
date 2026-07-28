import { createId } from './ids';
import { createInitialEditRecipe } from './metadata';
import type { EditRecipe, EditRecipeProcessing, HighPassHz, RetainedSegment } from './types';

/** Briefing default: short explicit fade, not silent. */
export const DEFAULT_FADE_SECONDS = 0.005;

/** Peak normalize target for MVP (−1.0 dBFS). */
export const DEFAULT_NORMALIZE_TARGET_DBFS = -1;

/** Soft limit ceiling matches normalize target unless overridden. */
export const DEFAULT_SOFT_LIMIT_DBFS = -1;

/** Default gate threshold for field ambience cleanup. */
export const DEFAULT_GATE_THRESHOLD_DBFS = -42;

/** Gain presets cycled from the take editor (dB). */
export const RECIPE_GAIN_PRESETS_DB = [-12, -6, 0, 6, 12] as const;

/** High-pass rumble presets cycled from the take editor (Hz). */
export const HIGH_PASS_CYCLE_HZ: HighPassHz[] = [0, 40, 80, 120, 240, 480];

/** Minimum retained region length (seconds). */
export const MIN_SEGMENT_SECONDS = 0.01;

export function defaultEditRecipeProcessing(): EditRecipeProcessing {
	return {
		highPassHz: 0,
		softLimitEnabled: false,
		gateEnabled: false,
		gateThresholdDbfs: DEFAULT_GATE_THRESHOLD_DBFS
	};
}

export function normalizeEditRecipeProcessing(
	processing: EditRecipeProcessing | undefined
): EditRecipeProcessing {
	const defaults = defaultEditRecipeProcessing();
	if (!processing) return defaults;
	return {
		highPassHz: processing.highPassHz ?? defaults.highPassHz,
		softLimitEnabled: processing.softLimitEnabled ?? defaults.softLimitEnabled,
		gateEnabled: processing.gateEnabled ?? defaults.gateEnabled,
		gateThresholdDbfs: processing.gateThresholdDbfs ?? defaults.gateThresholdDbfs
	};
}

export function isDefaultEditRecipeProcessing(
	processing: EditRecipeProcessing | undefined
): boolean {
	if (!processing) return true;
	const defaults = defaultEditRecipeProcessing();
	return (
		processing.highPassHz === defaults.highPassHz &&
		processing.softLimitEnabled === defaults.softLimitEnabled &&
		processing.gateEnabled === defaults.gateEnabled &&
		Math.abs(processing.gateThresholdDbfs - defaults.gateThresholdDbfs) <= 1e-6
	);
}

function cloneProcessing(
	processing: EditRecipeProcessing | undefined
): EditRecipeProcessing | undefined {
	if (!processing || isDefaultEditRecipeProcessing(processing)) return undefined;
	return { ...processing };
}

/** Deep-copy an edit recipe. Extend when new take-level recipe fields are added (Collect uses this). */
export function cloneEditRecipe(recipe: EditRecipe): EditRecipe {
	return {
		version: 1,
		segments: recipe.segments.map((segment) => ({ ...segment })),
		peakNormalization: recipe.peakNormalization ? { ...recipe.peakNormalization } : undefined,
		processing: cloneProcessing(recipe.processing)
	};
}

export function segmentDurationSeconds(segment: RetainedSegment): number {
	return Math.max(0, segment.sourceEndSeconds - segment.sourceStartSeconds);
}

/** Output duration after concatenating retained segments (pre-render). */
export function recipeDurationSeconds(recipe: EditRecipe): number {
	return recipe.segments.reduce((sum, segment) => sum + segmentDurationSeconds(segment), 0);
}

export type RetainedSourceRange = {
	start: number;
	end: number;
	fadeInSeconds: number;
	fadeOutSeconds: number;
};

export function retainedSourceRanges(recipe: EditRecipe): RetainedSourceRange[] {
	return recipe.segments
		.map((segment) => ({
			start: segment.sourceStartSeconds,
			end: segment.sourceEndSeconds,
			fadeInSeconds: segment.fadeInSeconds,
			fadeOutSeconds: segment.fadeOutSeconds
		}))
		.filter((range) => range.end - range.start > 0)
		.sort((a, b) => a.start - b.start);
}

/** Build a transient recipe from retained ranges (waveform preview / gain measurement). */
export function previewEditRecipeFromRanges(
	ranges: RetainedSourceRange[],
	peakNormalization?: EditRecipe['peakNormalization'],
	processing?: EditRecipe['processing']
): EditRecipe {
	return {
		version: 1,
		segments: ranges.map((range, index) => ({
			id: `preview-${index}`,
			sourceStartSeconds: range.start,
			sourceEndSeconds: range.end,
			fadeInSeconds: range.fadeInSeconds,
			fadeOutSeconds: range.fadeOutSeconds,
			gainDb: 0
		})),
		peakNormalization: peakNormalization ? { ...peakNormalization } : undefined,
		processing: cloneProcessing(processing)
	};
}

export function isIdentityRecipe(recipe: EditRecipe, sourceDurationSeconds: number): boolean {
	if (recipe.peakNormalization?.enabled) return false;
	if (!isDefaultEditRecipeProcessing(recipe.processing)) return false;
	if (recipe.segments.length !== 1) return false;
	const [segment] = recipe.segments;
	if (!segment) return false;
	return (
		segment.sourceStartSeconds <= 1e-9 &&
		Math.abs(segment.sourceEndSeconds - sourceDurationSeconds) <= 1e-6 &&
		segment.fadeInSeconds <= 1e-9 &&
		segment.fadeOutSeconds <= 1e-9 &&
		Math.abs(segment.gainDb) <= 1e-9
	);
}

function clampFade(seconds: number, segmentLength: number, otherFadeSeconds = 0): number {
	if (seconds <= 0 || segmentLength <= 0) return 0;
	const other = Math.max(0, otherFadeSeconds);
	const max = Math.max(0, segmentLength - other);
	return Math.min(seconds, max);
}

/** Keep fade-in + fade-out within the segment without overlapping. */
function fitFadesToLength(
	fadeInSeconds: number,
	fadeOutSeconds: number,
	segmentLength: number
): { fadeInSeconds: number; fadeOutSeconds: number } {
	if (segmentLength <= 0) return { fadeInSeconds: 0, fadeOutSeconds: 0 };
	let fadeIn = Math.max(0, fadeInSeconds);
	let fadeOut = Math.max(0, fadeOutSeconds);
	const sum = fadeIn + fadeOut;
	if (sum > segmentLength && sum > 0) {
		const scale = segmentLength / sum;
		fadeIn *= scale;
		fadeOut *= scale;
	} else {
		fadeIn = Math.min(fadeIn, segmentLength);
		fadeOut = Math.min(fadeOut, segmentLength);
	}
	return { fadeInSeconds: fadeIn, fadeOutSeconds: fadeOut };
}

function normalizeSelection(
	startSeconds: number,
	endSeconds: number
): { start: number; end: number } {
	const start = Math.min(startSeconds, endSeconds);
	const end = Math.max(startSeconds, endSeconds);
	if (end - start < MIN_SEGMENT_SECONDS) {
		throw new Error(`Selection must be at least ${MIN_SEGMENT_SECONDS * 1000} ms.`);
	}
	return { start, end };
}

function createSegment(
	sourceStartSeconds: number,
	sourceEndSeconds: number,
	template?: Partial<RetainedSegment>
): RetainedSegment {
	const length = sourceEndSeconds - sourceStartSeconds;
	const fades = fitFadesToLength(
		template?.fadeInSeconds ?? 0,
		template?.fadeOutSeconds ?? 0,
		length
	);
	return {
		id: createId(),
		sourceStartSeconds,
		sourceEndSeconds,
		fadeInSeconds: fades.fadeInSeconds,
		fadeOutSeconds: fades.fadeOutSeconds,
		gainDb: template?.gainDb ?? 0
	};
}

/**
 * Working region from a source selection (Collect loop / preview).
 * Always enables peak normalize so the user sees and hears the effect before Collect.
 * Optional gain/processing from the committed take recipe travel with Collect.
 */
export function recipeFromWorkingRegion(input: {
	startSeconds: number;
	endSeconds: number;
	fadeInSeconds?: number;
	fadeOutSeconds?: number;
	gainDb?: number;
	processing?: EditRecipe['processing'];
}): EditRecipe {
	const { start, end } = normalizeSelection(input.startSeconds, input.endSeconds);
	const processing = cloneProcessing(normalizeEditRecipeProcessing(input.processing));
	return {
		version: 1,
		segments: [
			createSegment(start, end, {
				fadeInSeconds: input.fadeInSeconds ?? 0,
				fadeOutSeconds: input.fadeOutSeconds ?? 0,
				gainDb: input.gainDb ?? 0
			})
		],
		peakNormalization: {
			enabled: true,
			targetDbfs: DEFAULT_NORMALIZE_TARGET_DBFS,
			calculatedGainDb: undefined
		},
		processing
	};
}

/**
 * Trim: retain only the selected source range as a single segment.
 * Enables peak normalize so gain is recalculated for the new retained bounds.
 * @deprecated Prefer {@link recipeFromWorkingRegion} for the Collect working-region loop.
 */
export function trimToSelection(
	_recipe: EditRecipe,
	startSeconds: number,
	endSeconds: number
): EditRecipe {
	return recipeFromWorkingRegion({ startSeconds, endSeconds });
}

/**
 * Nudge one retained-range boundary (source timeline). Range index is by
 * ascending source start. Clamped to neighbors and {@link MIN_SEGMENT_SECONDS}.
 */
export function adjustRetainedBoundary(
	recipe: EditRecipe,
	rangeIndex: number,
	edge: 'start' | 'end',
	seconds: number,
	sourceDurationSeconds: number
): EditRecipe {
	const ordered = [...recipe.segments].sort(
		(a, b) => a.sourceStartSeconds - b.sourceStartSeconds || a.sourceEndSeconds - b.sourceEndSeconds
	);
	const segment = ordered[rangeIndex];
	if (!segment) {
		throw new Error('Invalid retained range.');
	}

	const prevEnd = rangeIndex > 0 ? ordered[rangeIndex - 1]!.sourceEndSeconds : 0;
	const nextStart =
		rangeIndex < ordered.length - 1
			? ordered[rangeIndex + 1]!.sourceStartSeconds
			: Math.max(0, sourceDurationSeconds);

	let start = segment.sourceStartSeconds;
	let end = segment.sourceEndSeconds;
	const t = Number.isFinite(seconds) ? seconds : edge === 'start' ? start : end;

	if (edge === 'start') {
		start = Math.min(Math.max(t, prevEnd), end - MIN_SEGMENT_SECONDS);
	} else {
		end = Math.max(Math.min(t, nextStart), start + MIN_SEGMENT_SECONDS);
	}

	if (end - start < MIN_SEGMENT_SECONDS) {
		throw new Error(`Retained region must be at least ${MIN_SEGMENT_SECONDS * 1000} ms.`);
	}

	const updated: RetainedSegment = {
		...createSegment(start, end, segment),
		id: segment.id
	};

	return {
		version: 1,
		segments: recipe.segments.map((entry) => (entry.id === segment.id ? updated : { ...entry })),
		peakNormalization: recipe.peakNormalization
			? { ...recipe.peakNormalization, calculatedGainDb: undefined }
			: undefined,
		processing: cloneProcessing(recipe.processing)
	};
}

/**
 * Cut: remove the selected source range from all retained segments.
 */
export function cutSelection(
	recipe: EditRecipe,
	startSeconds: number,
	endSeconds: number
): EditRecipe {
	const { start, end } = normalizeSelection(startSeconds, endSeconds);
	const next: RetainedSegment[] = [];

	for (const segment of recipe.segments) {
		const segStart = segment.sourceStartSeconds;
		const segEnd = segment.sourceEndSeconds;
		if (end <= segStart || start >= segEnd) {
			next.push({ ...segment });
			continue;
		}
		if (start > segStart) {
			next.push(createSegment(segStart, Math.min(start, segEnd), segment));
		}
		if (end < segEnd) {
			next.push(createSegment(Math.max(end, segStart), segEnd, segment));
		}
	}

	const kept = next.filter((segment) => segmentDurationSeconds(segment) >= MIN_SEGMENT_SECONDS);
	if (kept.length === 0) {
		throw new Error('Cut would remove all audio.');
	}

	return {
		version: 1,
		segments: kept,
		peakNormalization: recipe.peakNormalization
			? { ...recipe.peakNormalization, calculatedGainDb: undefined }
			: undefined,
		processing: cloneProcessing(recipe.processing)
	};
}

/** Apply fade-in on the earliest retained segment. */
export function applyFadeIn(
	recipe: EditRecipe,
	fadeSeconds: number = DEFAULT_FADE_SECONDS
): EditRecipe {
	if (recipe.segments.length === 0) return cloneEditRecipe(recipe);
	const ordered = [...recipe.segments].sort((a, b) => a.sourceStartSeconds - b.sourceStartSeconds);
	const firstId = ordered[0]?.id;
	return {
		version: 1,
		segments: recipe.segments.map((segment) => {
			if (segment.id !== firstId) return { ...segment };
			const length = segmentDurationSeconds(segment);
			return {
				...segment,
				fadeInSeconds: clampFade(Math.max(0, fadeSeconds), length, segment.fadeOutSeconds)
			};
		}),
		peakNormalization: recipe.peakNormalization ? { ...recipe.peakNormalization } : undefined,
		processing: cloneProcessing(recipe.processing)
	};
}

/** Apply fade-out on the latest retained segment. */
export function applyFadeOut(
	recipe: EditRecipe,
	fadeSeconds: number = DEFAULT_FADE_SECONDS
): EditRecipe {
	if (recipe.segments.length === 0) return cloneEditRecipe(recipe);
	const ordered = [...recipe.segments].sort((a, b) => a.sourceStartSeconds - b.sourceStartSeconds);
	const lastId = ordered[ordered.length - 1]?.id;
	return {
		version: 1,
		segments: recipe.segments.map((segment) => {
			if (segment.id !== lastId) return { ...segment };
			const length = segmentDurationSeconds(segment);
			return {
				...segment,
				fadeOutSeconds: clampFade(Math.max(0, fadeSeconds), length, segment.fadeInSeconds)
			};
		}),
		peakNormalization: recipe.peakNormalization ? { ...recipe.peakNormalization } : undefined,
		processing: cloneProcessing(recipe.processing)
	};
}

/** Enable peak normalization to the MVP target (−1 dBFS). Gain is computed at render. */
export function enablePeakNormalization(
	recipe: EditRecipe,
	targetDbfs: number = DEFAULT_NORMALIZE_TARGET_DBFS
): EditRecipe {
	return {
		version: 1,
		segments: recipe.segments.map((segment) => ({ ...segment })),
		peakNormalization: {
			enabled: true,
			targetDbfs,
			calculatedGainDb: undefined
		},
		processing: cloneProcessing(recipe.processing)
	};
}

/** Clear peak normalization from the recipe (manual toggle off). */
export function disablePeakNormalization(recipe: EditRecipe): EditRecipe {
	const processing = normalizeEditRecipeProcessing(recipe.processing);
	const nextProcessing = processing.softLimitEnabled
		? { ...processing, softLimitEnabled: false }
		: processing;
	return {
		version: 1,
		segments: recipe.segments.map((segment) => ({ ...segment })),
		peakNormalization: undefined,
		processing: isDefaultEditRecipeProcessing(nextProcessing) ? undefined : nextProcessing
	};
}

/**
 * Commit peak normalize when the editor had identity preview on and the user
 * applies their first committed cleanup edit (gain / rumble / gate / limit).
 */
export function commitNormalizeIfNeeded(
	recipe: EditRecipe,
	options: { wasIdentity: boolean; hadNormalizePreview: boolean }
): EditRecipe {
	if (!options.wasIdentity || !options.hadNormalizePreview) return recipe;
	if (recipe.peakNormalization?.enabled) return recipe;
	return enablePeakNormalization(recipe);
}

function withProcessing(
	recipe: EditRecipe,
	mutate: (processing: EditRecipeProcessing) => EditRecipeProcessing
): EditRecipe {
	const next = mutate(normalizeEditRecipeProcessing(recipe.processing));
	return {
		version: 1,
		segments: recipe.segments.map((segment) => ({ ...segment })),
		peakNormalization: recipe.peakNormalization
			? { ...recipe.peakNormalization, calculatedGainDb: undefined }
			: undefined,
		processing: isDefaultEditRecipeProcessing(next) ? undefined : next
	};
}

/** Apply the same gain (dB) to every retained segment. */
export function setRecipeGainDb(recipe: EditRecipe, gainDb: number): EditRecipe {
	return {
		version: 1,
		segments: recipe.segments.map((segment) => ({ ...segment, gainDb })),
		peakNormalization: recipe.peakNormalization
			? { ...recipe.peakNormalization, calculatedGainDb: undefined }
			: undefined,
		processing: cloneProcessing(recipe.processing)
	};
}

/** Cycle manual gain through {@link RECIPE_GAIN_PRESETS_DB}. */
export function cycleRecipeGainDb(recipe: EditRecipe): EditRecipe {
	const current = recipe.segments[0]?.gainDb ?? 0;
	const index = RECIPE_GAIN_PRESETS_DB.findIndex((value) => Math.abs(value - current) <= 1e-6);
	const next = RECIPE_GAIN_PRESETS_DB[(index + 1) % RECIPE_GAIN_PRESETS_DB.length] ?? 0;
	return setRecipeGainDb(recipe, next);
}

/** Cycle high-pass rumble cut: Off → 40 → 80 → 120 → 240 → 480 → Off. */
export function cycleHighPassHz(recipe: EditRecipe): EditRecipe {
	return withProcessing(recipe, (processing) => {
		const index = HIGH_PASS_CYCLE_HZ.indexOf(processing.highPassHz);
		const next = HIGH_PASS_CYCLE_HZ[(index + 1) % HIGH_PASS_CYCLE_HZ.length] ?? 0;
		return { ...processing, highPassHz: next };
	});
}

export function toggleSoftLimit(recipe: EditRecipe): EditRecipe {
	const processing = normalizeEditRecipeProcessing(recipe.processing);
	const enabling = !processing.softLimitEnabled;
	let next = withProcessing(recipe, (entry) => ({
		...entry,
		softLimitEnabled: !entry.softLimitEnabled
	}));
	if (enabling && !next.peakNormalization?.enabled) {
		next = enablePeakNormalization(next);
	}
	return next;
}

export function toggleGate(recipe: EditRecipe): EditRecipe {
	return withProcessing(recipe, (processing) => ({
		...processing,
		gateEnabled: !processing.gateEnabled
	}));
}

export function resetEditRecipe(sourceDurationSeconds: number): EditRecipe {
	return createInitialEditRecipe(sourceDurationSeconds);
}

/** In-memory undo/redo stack for the editor session (not persisted). */
export class EditRecipeHistory {
	#past: EditRecipe[] = [];
	#present: EditRecipe;
	#future: EditRecipe[] = [];

	constructor(initial: EditRecipe) {
		this.#present = cloneEditRecipe(initial);
	}

	get current(): EditRecipe {
		return cloneEditRecipe(this.#present);
	}

	get canUndo(): boolean {
		return this.#past.length > 0;
	}

	get canRedo(): boolean {
		return this.#future.length > 0;
	}

	commit(next: EditRecipe): EditRecipe {
		this.#past.push(cloneEditRecipe(this.#present));
		this.#present = cloneEditRecipe(next);
		this.#future = [];
		return this.current;
	}

	undo(): EditRecipe | null {
		const previous = this.#past.pop();
		if (!previous) return null;
		this.#future.push(cloneEditRecipe(this.#present));
		this.#present = previous;
		return this.current;
	}

	redo(): EditRecipe | null {
		const next = this.#future.pop();
		if (!next) return null;
		this.#past.push(cloneEditRecipe(this.#present));
		this.#present = next;
		return this.current;
	}

	/** Restore full-source identity recipe (undoable). */
	resetToIdentity(sourceDurationSeconds: number): EditRecipe {
		return this.commit(resetEditRecipe(sourceDurationSeconds));
	}

	/** Replace history after load (clears undo stack). */
	replace(recipe: EditRecipe): void {
		this.#past = [];
		this.#future = [];
		this.#present = cloneEditRecipe(recipe);
	}
}
