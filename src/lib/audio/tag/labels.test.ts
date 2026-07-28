import { describe, expect, it } from 'vitest';
import { audiosetLabelToTag, selectTagsFromScores } from './labels';

describe('audiosetLabelToTag', () => {
	it('maps known field labels to short slugs', () => {
		expect(audiosetLabelToTag('Rain')).toBe('rain');
		expect(audiosetLabelToTag('Bird')).toBe('bird');
		expect(audiosetLabelToTag('Door knock')).toBe('door');
	});

	it('slugifies unknown labels and drops generic noise', () => {
		expect(audiosetLabelToTag('Metal impact')).toBe('metal-impact');
		expect(audiosetLabelToTag('Noise')).toBeNull();
	});
});

describe('selectTagsFromScores', () => {
	it('returns ranked unique tags above threshold', () => {
		const tags = selectTagsFromScores(
			[
				{ categoryName: 'Rain', score: 0.4 },
				{ categoryName: 'Thunder', score: 0.3 },
				{ categoryName: 'Rain on surface', score: 0.2 },
				{ categoryName: 'Noise', score: 0.9 }
			],
			{ minScore: 0.1, maxTags: 3 }
		);
		expect(tags).toEqual(['rain', 'thunder']);
	});

	it('returns no tags when nothing clears threshold', () => {
		expect(
			selectTagsFromScores([{ categoryName: 'Rain', score: 0.01 }], { minScore: 0.1 })
		).toEqual([]);
	});
});
