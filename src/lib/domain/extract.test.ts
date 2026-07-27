import { describe, expect, it } from 'vitest';
import { createSession, createTake, createInitialEditRecipe } from './metadata';
import { applyFadeIn, applyFadeOut, trimToSelection } from './edit-recipe';
import { buildExtractTake, cloneEditRecipeForCollect, collectableRetainedBounds } from './extract';

describe('collectableRetainedBounds', () => {
	it('returns null for a full-source identity recipe', () => {
		expect(collectableRetainedBounds(createInitialEditRecipe(30), 30)).toBeNull();
	});

	it('returns trim bounds for a single retained segment', () => {
		const recipe = trimToSelection(createInitialEditRecipe(30), 4, 9);
		expect(collectableRetainedBounds(recipe, 30)).toEqual({ start: 4, end: 9 });
	});

	it('ignores fades/normalize alone when bounds still span the full source', () => {
		const recipe = createInitialEditRecipe(10);
		recipe.peakNormalization = { enabled: true, targetDbfs: -1 };
		recipe.segments[0]!.fadeInSeconds = 0.05;
		expect(collectableRetainedBounds(recipe, 10)).toBeNull();
	});
});

describe('cloneEditRecipeForCollect', () => {
	it('copies fades, gain, and peak normalize onto a new segment id', () => {
		let recipe = trimToSelection(createInitialEditRecipe(30), 4, 9);
		recipe = applyFadeIn(recipe, 0.12);
		recipe = applyFadeOut(recipe, 0.08);
		recipe.segments[0]!.gainDb = -1.5;
		recipe.peakNormalization = {
			enabled: true,
			targetDbfs: -1,
			calculatedGainDb: 3.2
		};

		const cloned = cloneEditRecipeForCollect(recipe, 30);
		expect(cloned).not.toBeNull();
		expect(cloned!.segments).toHaveLength(1);
		expect(cloned!.segments[0]?.sourceStartSeconds).toBe(4);
		expect(cloned!.segments[0]?.sourceEndSeconds).toBe(9);
		expect(cloned!.segments[0]?.fadeInSeconds).toBeCloseTo(0.12);
		expect(cloned!.segments[0]?.fadeOutSeconds).toBeCloseTo(0.08);
		expect(cloned!.segments[0]?.gainDb).toBeCloseTo(-1.5);
		expect(cloned!.segments[0]?.id).not.toBe(recipe.segments[0]?.id);
		expect(cloned!.peakNormalization).toEqual({
			enabled: true,
			targetDbfs: -1,
			calculatedGainDb: 3.2
		});
	});

	it('returns null for a full-source recipe', () => {
		expect(cloneEditRecipeForCollect(createInitialEditRecipe(10), 10)).toBeNull();
	});
});

describe('buildExtractTake', () => {
	it('shares source and retains the selection with numbered name', () => {
		const session = createSession('Field');
		const parentDraft = createTake({
			session,
			sequence: 1,
			source: {
				fileRef: 'sessions/s/takes/t/source.bin',
				mimeType: 'audio/webm',
				byteLength: 4096,
				durationSeconds: 30,
				sourceType: 'recording'
			}
		});
		const parent = {
			...parentDraft,
			lifecycleState: 'saved' as const,
			editRecipe: trimToSelection(createInitialEditRecipe(30), 4, 9)
		};

		const extract = buildExtractTake({
			parent,
			session,
			sequence: 2,
			existingDisplayNames: [parent.metadata.displayName]
		});

		expect(extract.source.fileRef).toBe(parent.source.fileRef);
		expect(extract.derivedFromTakeId).toBe(parent.id);
		expect(extract.editRecipe.segments).toHaveLength(1);
		expect(extract.editRecipe.segments[0]?.sourceStartSeconds).toBe(4);
		expect(extract.editRecipe.segments[0]?.sourceEndSeconds).toBe(9);
		expect(extract.lifecycleState).toBe('finalizing');
		expect(extract.metadata.displayName).toBe('Field 02');
		expect(extract.metadata.displayName).not.toMatch(/[—–]/);
	});

	it('preserves fades and normalize from the collectable recipe', () => {
		const session = createSession('Field');
		let recipe = trimToSelection(createInitialEditRecipe(30), 2, 8);
		recipe = applyFadeIn(recipe, 0.05);
		recipe = applyFadeOut(recipe, 0.04);
		const parent = {
			...createTake({
				session,
				sequence: 1,
				source: {
					fileRef: 'sessions/s/takes/t/source.bin',
					mimeType: 'audio/webm',
					byteLength: 4096,
					durationSeconds: 30,
					sourceType: 'recording'
				}
			}),
			lifecycleState: 'saved' as const,
			editRecipe: createInitialEditRecipe(30)
		};

		const extract = buildExtractTake({
			parent,
			session,
			sequence: 2,
			recipe
		});

		expect(extract.editRecipe.segments[0]?.fadeInSeconds).toBeCloseTo(0.05);
		expect(extract.editRecipe.segments[0]?.fadeOutSeconds).toBeCloseTo(0.04);
		expect(extract.editRecipe.peakNormalization?.enabled).toBe(true);
		expect(extract.editRecipe.peakNormalization?.targetDbfs).toBe(-1);
	});

	it('rejects a full-source recipe', () => {
		const session = createSession('Field');
		const parent = {
			...createTake({
				session,
				sequence: 1,
				source: {
					fileRef: 'sessions/s/takes/t/source.bin',
					mimeType: 'audio/webm',
					byteLength: 100,
					durationSeconds: 5,
					sourceType: 'recording'
				}
			}),
			lifecycleState: 'saved' as const
		};

		expect(() =>
			buildExtractTake({
				parent,
				session,
				sequence: 2
			})
		).toThrow(/retained trim/i);
	});
});
