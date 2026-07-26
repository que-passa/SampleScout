import { describe, expect, it } from 'vitest';
import { applyFadeIn, applyFadeOut, cutSelection, enablePeakNormalization, trimToSelection } from '$lib/domain/edit-recipe';
import { createInitialEditRecipe } from '$lib/domain/metadata';
import type { DecodedPlanarAudio } from '$lib/audio/decode';
import { measureRecipePeak, renderRecipePlanar } from './index';

function makeTone(opts: {
	seconds: number;
	sampleRate?: number;
	amplitude?: number;
	channels?: number;
}): DecodedPlanarAudio {
	const sampleRate = opts.sampleRate ?? 1000;
	const amplitude = opts.amplitude ?? 0.5;
	const channelCount = opts.channels ?? 1;
	const frameCount = Math.round(opts.seconds * sampleRate);
	const channels = Array.from({ length: channelCount }, () => {
		const data = new Float32Array(frameCount);
		for (let i = 0; i < frameCount; i += 1) {
			data[i] = amplitude;
		}
		return data;
	});
	return {
		channels,
		frameCount,
		durationSeconds: opts.seconds,
		channelCount,
		sampleRate
	};
}

describe('renderRecipePlanar', () => {
	it('trims output duration to the retained range', () => {
		const source = makeTone({ seconds: 4 });
		const recipe = trimToSelection(createInitialEditRecipe(4), 1, 3);
		const out = renderRecipePlanar(source, recipe);
		expect(out.durationSeconds).toBeCloseTo(2, 5);
		expect(out.frameCount).toBe(2000);
		expect(out.channels[0]?.[0]).toBeCloseTo(0.5);
	});

	it('cuts an interior region and concatenates remainders', () => {
		const source = makeTone({ seconds: 4 });
		const recipe = cutSelection(createInitialEditRecipe(4), 1, 3);
		const out = renderRecipePlanar(source, recipe);
		expect(out.durationSeconds).toBeCloseTo(2, 5);
	});

	it('applies fade in and fade out to rendered samples', () => {
		const source = makeTone({ seconds: 1, amplitude: 1 });
		let recipe = createInitialEditRecipe(1);
		recipe = applyFadeIn(recipe, 0.1);
		recipe = applyFadeOut(recipe, 0.1);
		const out = renderRecipePlanar(source, recipe);
		const data = out.channels[0]!;
		expect(data[0]).toBeCloseTo(0, 5);
		expect(data[Math.floor(0.05 * out.sampleRate)]).toBeCloseTo(0.5, 1);
		expect(data[Math.floor(0.5 * out.sampleRate)]).toBeCloseTo(1, 5);
		expect(data[out.frameCount - 1]).toBeCloseTo(0, 5);
	});

	it('peak-normalizes to the target without exceeding it', () => {
		const source = makeTone({ seconds: 0.5, amplitude: 0.25 });
		const recipe = enablePeakNormalization(createInitialEditRecipe(0.5), -1);
		const peakBefore = measureRecipePeak(source, recipe);
		expect(peakBefore).toBeCloseTo(0.25, 5);
		const out = renderRecipePlanar(source, recipe);
		const target = Math.pow(10, -1 / 20);
		let peak = 0;
		for (const sample of out.channels[0] ?? []) {
			peak = Math.max(peak, Math.abs(sample));
		}
		expect(peak).toBeCloseTo(target, 5);
		expect(peak).toBeLessThanOrEqual(target + 1e-6);
	});
});
