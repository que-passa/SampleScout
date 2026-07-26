import { describe, expect, it } from 'vitest';
import {
	EditRecipeHistory,
	adjustRetainedBoundary,
	applyFadeIn,
	applyFadeOut,
	cutSelection,
	enablePeakNormalization,
	isIdentityRecipe,
	recipeDurationSeconds,
	retainedSourceRanges,
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
