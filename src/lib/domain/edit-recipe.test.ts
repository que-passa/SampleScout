import { describe, expect, it } from 'vitest';
import {
	EditRecipeHistory,
	adjustRetainedBoundary,
	applyFadeIn,
	applyFadeOut,
	cutSelection,
	commitNormalizeIfNeeded,
	cycleHighPassHz,
	cycleRecipeGainDb,
	disablePeakNormalization,
	enablePeakNormalization,
	isIdentityRecipe,
	recipeDurationSeconds,
	recipeFromWorkingRegion,
	retainedSourceRanges,
	setRecipeGainDb,
	toggleGate,
	toggleSoftLimit,
	trimToSelection
} from './edit-recipe';
import { createInitialEditRecipe } from './metadata';

describe('trimToSelection', () => {
	it('keeps a single source range', () => {
		const recipe = createInitialEditRecipe(10);
		const next = trimToSelection(recipe, 2, 5);
		expect(next.segments).toHaveLength(1);
		expect(next.segments[0]?.sourceStartSeconds).toBe(2);
		expect(next.segments[0]?.sourceEndSeconds).toBe(5);
		expect(recipeDurationSeconds(next)).toBe(3);
	});

	it('enables peak normalize for the trimmed retained bounds', () => {
		const recipe = createInitialEditRecipe(10);
		const next = trimToSelection(recipe, 2, 5);
		expect(next.peakNormalization?.enabled).toBe(true);
		expect(next.peakNormalization?.targetDbfs).toBe(-1);
		expect(next.peakNormalization?.calculatedGainDb).toBeUndefined();
	});
});

describe('adjustRetainedBoundary', () => {
	it('moves a trim start and end within the source', () => {
		const recipe = trimToSelection(createInitialEditRecipe(10), 2, 8);
		const movedStart = adjustRetainedBoundary(recipe, 0, 'start', 3, 10);
		expect(movedStart.segments[0]?.sourceStartSeconds).toBe(3);
		expect(movedStart.segments[0]?.sourceEndSeconds).toBe(8);

		const movedEnd = adjustRetainedBoundary(movedStart, 0, 'end', 7, 10);
		expect(movedEnd.segments[0]?.sourceStartSeconds).toBe(3);
		expect(movedEnd.segments[0]?.sourceEndSeconds).toBe(7);
	});

	it('clamps against neighboring segments after a cut', () => {
		const recipe = cutSelection(createInitialEditRecipe(10), 4, 6);
		const moved = adjustRetainedBoundary(recipe, 0, 'end', 9, 10);
		expect(moved.segments.find((s) => s.sourceStartSeconds === 0)?.sourceEndSeconds).toBe(6);
	});
});

describe('cutSelection', () => {
	it('removes an interior region and concatenates remainders', () => {
		const recipe = createInitialEditRecipe(10);
		const next = cutSelection(recipe, 3, 6);
		expect(next.segments).toHaveLength(2);
		expect(retainedSourceRanges(next)).toEqual([
			{ start: 0, end: 3, fadeInSeconds: 0, fadeOutSeconds: 0 },
			{ start: 6, end: 10, fadeInSeconds: 0, fadeOutSeconds: 0 }
		]);
		expect(recipeDurationSeconds(next)).toBe(7);
	});

	it('rejects a cut that would remove everything', () => {
		const recipe = createInitialEditRecipe(2);
		expect(() => cutSelection(recipe, 0, 2)).toThrow(/remove all audio/);
	});
});

describe('fades and normalize', () => {
	it('applies fade in/out on edge segments', () => {
		const recipe = cutSelection(createInitialEditRecipe(10), 4, 6);
		const withIn = applyFadeIn(recipe, 0.05);
		const withOut = applyFadeOut(withIn, 0.08);
		const first = withOut.segments.find((s) => s.sourceStartSeconds === 0);
		const last = withOut.segments.find((s) => s.sourceEndSeconds === 10);
		expect(first?.fadeInSeconds).toBeCloseTo(0.05);
		expect(last?.fadeOutSeconds).toBeCloseTo(0.08);
	});

	it('allows a fade up to the full segment when the other fade is zero', () => {
		const recipe = trimToSelection(createInitialEditRecipe(4), 0, 4);
		const withIn = applyFadeIn(recipe, 4);
		expect(withIn.segments[0]?.fadeInSeconds).toBeCloseTo(4);
		expect(withIn.segments[0]?.fadeOutSeconds).toBe(0);
	});

	it('prevents fade in/out from overlapping', () => {
		const recipe = applyFadeOut(trimToSelection(createInitialEditRecipe(4), 0, 4), 1.5);
		const withIn = applyFadeIn(recipe, 3);
		expect(withIn.segments[0]?.fadeInSeconds).toBeCloseTo(2.5);
		expect(withIn.segments[0]?.fadeOutSeconds).toBeCloseTo(1.5);
		expect(
			(withIn.segments[0]?.fadeInSeconds ?? 0) + (withIn.segments[0]?.fadeOutSeconds ?? 0)
		).toBeLessThanOrEqual(4 + 1e-9);
	});

	it('enables peak normalization at −1 dBFS', () => {
		const recipe = enablePeakNormalization(createInitialEditRecipe(1));
		expect(recipe.peakNormalization?.enabled).toBe(true);
		expect(recipe.peakNormalization?.targetDbfs).toBe(-1);
	});

	it('disables peak normalization', () => {
		const on = enablePeakNormalization(createInitialEditRecipe(1));
		const off = disablePeakNormalization(on);
		expect(off.peakNormalization).toBeUndefined();
	});

	it('disables soft limit when peak normalization is turned off', () => {
		let recipe = enablePeakNormalization(createInitialEditRecipe(1));
		recipe = toggleSoftLimit(recipe);
		expect(recipe.processing?.softLimitEnabled).toBe(true);
		const off = disablePeakNormalization(recipe);
		expect(off.peakNormalization).toBeUndefined();
		expect(off.processing?.softLimitEnabled).toBeUndefined();
	});

	it('enables peak normalize when soft limit is turned on', () => {
		const recipe = toggleSoftLimit(createInitialEditRecipe(1));
		expect(recipe.peakNormalization?.enabled).toBe(true);
		expect(recipe.processing?.softLimitEnabled).toBe(true);
	});

	it('commits normalize when leaving identity with preview active', () => {
		const recipe = commitNormalizeIfNeeded(setRecipeGainDb(createInitialEditRecipe(4), 6), {
			wasIdentity: true,
			hadNormalizePreview: true
		});
		expect(recipe.peakNormalization?.enabled).toBe(true);
		expect(recipe.peakNormalization?.targetDbfs).toBe(-1);
	});

	it('cycles gain presets and clears identity', () => {
		const recipe = cycleRecipeGainDb(createInitialEditRecipe(4));
		expect(recipe.segments[0]?.gainDb).toBe(6);
		expect(isIdentityRecipe(recipe, 4)).toBe(false);
	});

	it('cycles high-pass presets and toggles gate/limit', () => {
		let recipe = cycleHighPassHz(createInitialEditRecipe(4));
		expect(recipe.processing?.highPassHz).toBe(40);
		recipe = toggleGate(recipe);
		expect(recipe.processing?.gateEnabled).toBe(true);
		recipe = toggleSoftLimit(recipe);
		expect(recipe.processing?.softLimitEnabled).toBe(true);
		expect(isIdentityRecipe(recipe, 4)).toBe(false);
	});
});

describe('recipeFromWorkingRegion', () => {
	it('builds a normalized single segment with optional fades', () => {
		const recipe = recipeFromWorkingRegion({
			startSeconds: 1,
			endSeconds: 4,
			fadeInSeconds: 0.1,
			fadeOutSeconds: 0.2
		});
		expect(recipe.segments).toHaveLength(1);
		expect(recipe.segments[0]?.sourceStartSeconds).toBe(1);
		expect(recipe.segments[0]?.sourceEndSeconds).toBe(4);
		expect(recipe.segments[0]?.fadeInSeconds).toBeCloseTo(0.1);
		expect(recipe.segments[0]?.fadeOutSeconds).toBeCloseTo(0.2);
		expect(recipe.segments[0]?.gainDb).toBe(0);
		expect(recipe.peakNormalization?.enabled).toBe(true);
		expect(recipe.peakNormalization?.targetDbfs).toBe(-1);
		expect(recipe.processing).toBeUndefined();
	});

	it('carries segment gain and take-level processing for Collect', () => {
		const recipe = recipeFromWorkingRegion({
			startSeconds: 2,
			endSeconds: 5,
			gainDb: 6,
			processing: {
				highPassHz: 80,
				softLimitEnabled: true,
				gateEnabled: true,
				gateThresholdDbfs: -42
			}
		});
		expect(recipe.segments[0]?.gainDb).toBe(6);
		expect(recipe.processing).toEqual({
			highPassHz: 80,
			softLimitEnabled: true,
			gateEnabled: true,
			gateThresholdDbfs: -42
		});
	});
});

describe('isIdentityRecipe', () => {
	it('detects the initial full-source recipe', () => {
		const recipe = createInitialEditRecipe(4.5);
		expect(isIdentityRecipe(recipe, 4.5)).toBe(true);
		expect(isIdentityRecipe(trimToSelection(recipe, 0, 2), 4.5)).toBe(false);
	});
});

describe('EditRecipeHistory', () => {
	it('supports undo, redo, and reset to identity', () => {
		const history = new EditRecipeHistory(createInitialEditRecipe(8));
		history.commit(trimToSelection(history.current, 1, 4));
		history.commit(applyFadeIn(history.current, 0.01));
		expect(history.canUndo).toBe(true);

		const undone = history.undo();
		expect(undone?.segments[0]?.fadeInSeconds ?? 1).toBe(0);
		expect(history.canRedo).toBe(true);

		history.redo();
		expect(history.current.segments[0]?.fadeInSeconds).toBeCloseTo(0.01);

		const reset = history.resetToIdentity(8);
		expect(isIdentityRecipe(reset, 8)).toBe(true);
		expect(history.canUndo).toBe(true);
	});
});
