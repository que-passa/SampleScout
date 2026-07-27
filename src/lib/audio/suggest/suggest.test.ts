import { describe, expect, it } from 'vitest';
import { SUGGEST_REGIONS_ALGORITHM_VERSION } from '$lib/config/suggest-regions';
import { suggestRegionsFromPlanar } from './index';

const SAMPLE_RATE = 48_000;

function silence(seconds: number): Float32Array {
	return new Float32Array(Math.round(seconds * SAMPLE_RATE));
}

function tone(seconds: number, amplitude = 0.4): Float32Array {
	const n = Math.round(seconds * SAMPLE_RATE);
	const out = new Float32Array(n);
	for (let i = 0; i < n; i += 1) {
		out[i] = Math.sin((2 * Math.PI * 440 * i) / SAMPLE_RATE) * amplitude;
	}
	return out;
}

function concat(...parts: Float32Array[]): Float32Array {
	const total = parts.reduce((sum, part) => sum + part.length, 0);
	const out = new Float32Array(total);
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.length;
	}
	return out;
}

describe('suggestRegionsFromPlanar', () => {
	it('finds spaced hits separated by silence', () => {
		const samples = concat(silence(0.5), tone(0.3), silence(0.6), tone(0.25), silence(0.4));
		const result = suggestRegionsFromPlanar({
			channels: [samples],
			sampleRate: SAMPLE_RATE
		});
		expect(result.algorithmVersion).toBe(SUGGEST_REGIONS_ALGORITHM_VERSION);
		expect(result.regions.length).toBe(2);
		expect(result.regions[0]!.startSeconds).toBeLessThan(0.6);
		expect(result.regions[0]!.endSeconds).toBeGreaterThan(0.7);
		expect(result.regions[1]!.startSeconds).toBeGreaterThan(1.0);
	});

	it('returns empty for continuous near-full energy', () => {
		const samples = tone(4, 0.3);
		const result = suggestRegionsFromPlanar({
			channels: [samples],
			sampleRate: SAMPLE_RATE
		});
		expect(result.regions).toEqual([]);
	});

	it('returns empty for near-silence', () => {
		const samples = silence(5);
		const result = suggestRegionsFromPlanar({
			channels: [samples],
			sampleRate: SAMPLE_RATE
		});
		expect(result.regions).toEqual([]);
	});

	it('merges hits separated by a short gap', () => {
		const samples = concat(silence(0.4), tone(0.2), silence(0.05), tone(0.2), silence(0.4));
		const result = suggestRegionsFromPlanar({
			channels: [samples],
			sampleRate: SAMPLE_RATE
		});
		expect(result.regions.length).toBe(1);
	});

	it('handles stereo downmix', () => {
		const left = concat(silence(0.4), tone(0.35), silence(0.5));
		const right = new Float32Array(left.length);
		const result = suggestRegionsFromPlanar({
			channels: [left, right],
			sampleRate: SAMPLE_RATE
		});
		expect(result.regions.length).toBe(1);
	});
});
