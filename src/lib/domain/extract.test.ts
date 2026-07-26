import { describe, expect, it } from 'vitest';
import { createSession, createTakeDraft } from './metadata';
import {
	buildExtractTakeDraft,
	formatExtractClock,
	formatExtractDisplayName
} from './extract';

describe('formatExtractClock', () => {
	it('formats mm:ss.mmm', () => {
		expect(formatExtractClock(83.456)).toBe('01:23.456');
	});
});

describe('formatExtractDisplayName', () => {
	it('cites parent and range', () => {
		expect(formatExtractDisplayName('Field Session · 25 Jul — 001', 1.5, 3)).toBe(
			'Field Session · 25 Jul — 001 · 00:01.500–00:03.000'
		);
	});
});

describe('buildExtractTakeDraft', () => {
	it('shares source and retains only the selection', () => {
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
			endSeconds: 9
		});

		expect(extract.source.fileRef).toBe(parent.source.fileRef);
		expect(extract.derivedFromTakeId).toBe(parent.id);
		expect(extract.editRecipe.segments).toHaveLength(1);
		expect(extract.editRecipe.segments[0]?.sourceStartSeconds).toBe(4);
		expect(extract.editRecipe.segments[0]?.sourceEndSeconds).toBe(9);
		expect(extract.lifecycleState).toBe('finalizing');
		expect(extract.metadata.displayName).toContain('00:04.000–00:09.000');
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
