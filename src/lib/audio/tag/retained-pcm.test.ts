import { createInitialEditRecipe, trimToSelection } from '$lib/domain';
import { describe, expect, it } from 'vitest';
import { extractClassificationPcm } from './retained-pcm';

function planarFromMono(values: number[], sampleRate = 16_000) {
	const channel = Float32Array.from(values);
	return {
		channels: [channel],
		channelCount: 1,
		sampleRate,
		frameCount: channel.length,
		durationSeconds: channel.length / sampleRate
	};
}

describe('extractClassificationPcm', () => {
	it('returns the source unchanged for an identity recipe', () => {
		const source = planarFromMono([0, 0.5, 1, 0.5, 0]);
		const recipe = createInitialEditRecipe(source.durationSeconds);
		const extracted = extractClassificationPcm(source, recipe, source.durationSeconds);
		expect(extracted).toBe(source);
	});

	it('slices a single retained range for classification', () => {
		const source = planarFromMono([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 10);
		const recipe = trimToSelection(createInitialEditRecipe(1), 0.2, 0.5);
		const extracted = extractClassificationPcm(source, recipe, 1);
		expect(extracted.frameCount).toBe(3);
		expect([...extracted.channels[0]!]).toEqual([2, 3, 4]);
		expect(extracted.durationSeconds).toBeCloseTo(0.3, 5);
	});

	it('concatenates multiple retained segments in recipe order', () => {
		const source = planarFromMono([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 10);
		const recipe = {
			version: 1 as const,
			segments: [
				{
					id: 'a',
					sourceStartSeconds: 0.1,
					sourceEndSeconds: 0.2,
					fadeInSeconds: 0,
					fadeOutSeconds: 0,
					gainDb: 0
				},
				{
					id: 'b',
					sourceStartSeconds: 0.7,
					sourceEndSeconds: 0.9,
					fadeInSeconds: 0,
					fadeOutSeconds: 0,
					gainDb: 0
				}
			]
		};
		const extracted = extractClassificationPcm(source, recipe, 1);
		expect([...extracted.channels[0]!]).toEqual([1, 7, 8]);
	});
});
