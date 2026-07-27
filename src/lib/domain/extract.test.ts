import { describe, expect, it } from 'vitest';
import { createSession, createTakeDraft, createInitialEditRecipe } from './metadata';
import { trimToSelection } from './edit-recipe';
import { buildExtractTakeDraft, collectableRetainedBounds } from './extract';

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

describe('buildExtractTakeDraft', () => {
	it('shares source and retains only the selection with numbered name', () => {
		const session = createSession('Field');
		const parentDraft = createTakeDraft({
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
		const parent = { ...parentDraft, lifecycleState: 'saved' as const };

		const extract = buildExtractTakeDraft({
			parent,
			session,
			sequence: 2,
			startSeconds: 4,
			endSeconds: 9,
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

	it('rejects a too-short selection', () => {
		const session = createSession('Field');
		const parent = {
			...createTakeDraft({
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
			buildExtractTakeDraft({
				parent,
				session,
				sequence: 2,
				startSeconds: 1,
				endSeconds: 1.005
			})
		).toThrow(/at least/i);
	});
});
