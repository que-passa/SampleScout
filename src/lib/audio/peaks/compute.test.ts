import { describe, expect, it } from 'vitest';
import {
	computePeaksPlanar,
	computePeaksWindowFromPlanar,
	decodePeaksBinary,
	encodePeaksBinary,
	framesPerPeakForLength,
	needsDetailPeaks,
	PEAKS_MAGIC,
	readPeak,
	resamplePeaksWindow
} from './index';

describe('framesPerPeakForLength', () => {
	it('targets roughly 4096 peaks for long material', () => {
		const frames = 48_000 * 60;
		const fpp = framesPerPeakForLength(frames);
		expect(Math.ceil(frames / fpp)).toBeLessThanOrEqual(4096);
		expect(Math.ceil(frames / fpp)).toBeGreaterThan(2000);
	});

	it('uses 1 frame per peak for short clips', () => {
		expect(framesPerPeakForLength(100, 4096)).toBe(1);
	});
});

describe('computePeaksPlanar', () => {
	it('preserves a transient spike in min/max buckets', () => {
		const samples = new Float32Array(32);
		samples[10] = 0.95;
		samples[11] = -0.8;
		const result = computePeaksPlanar({ channels: [samples], framesPerPeak: 8 });
		expect(result.peakCount).toBe(4);
		const spike = readPeak(result.data, 1, 4, 0, 1);
		expect(spike.max).toBeCloseTo(0.95, 5);
		expect(spike.min).toBeCloseTo(-0.8, 5);
	});

	it('computes independent lanes for stereo', () => {
		const left = new Float32Array([0.5, 0.5, 0.5, 0.5]);
		const right = new Float32Array([-0.25, -0.25, -0.25, -0.25]);
		const result = computePeaksPlanar({ channels: [left, right], framesPerPeak: 2 });
		expect(result.channels).toBe(2);
		expect(readPeak(result.data, 2, result.peakCount, 0, 0).max).toBeCloseTo(0.5, 5);
		expect(readPeak(result.data, 2, result.peakCount, 1, 0).min).toBeCloseTo(-0.25, 5);
	});
});

describe('peaks binary format', () => {
	it('round-trips encode/decode', () => {
		const samples = new Float32Array(16);
		for (let i = 0; i < samples.length; i += 1) samples[i] = (i / 15) * 2 - 1;
		const computed = computePeaksPlanar({ channels: [samples], framesPerPeak: 4 });
		const binary = encodePeaksBinary(computed);
		const view = new DataView(binary);
		expect(view.getUint32(0, true)).toBe(PEAKS_MAGIC);
		const decoded = decodePeaksBinary(binary);
		expect(decoded.channels).toBe(computed.channels);
		expect(decoded.peakCount).toBe(computed.peakCount);
		expect(decoded.framesPerPeak).toBe(computed.framesPerPeak);
		expect([...decoded.data]).toEqual([...computed.data]);
	});
});

describe('resamplePeaksWindow', () => {
	it('merges adjacent peaks without averaging away extremes', () => {
		const samples = new Float32Array(16);
		samples[0] = 1;
		samples[15] = -1;
		const computed = computePeaksPlanar({ channels: [samples], framesPerPeak: 1 });
		const windowed = resamplePeaksWindow(computed.data, 1, computed.peakCount, 0, 16, 2);
		expect(windowed[1]).toBeCloseTo(1, 5);
		expect(windowed[2]).toBeCloseTo(-1, 5);
	});
});

describe('needsDetailPeaks', () => {
	it('is false when overview has at least one peak per column', () => {
		expect(needsDetailPeaks(4096, 1, 800)).toBe(false);
		expect(needsDetailPeaks(4096, 0.25, 800)).toBe(false);
	});

	it('is true when zoom stretches overview below one peak per column', () => {
		expect(needsDetailPeaks(4096, 1 / 64, 800)).toBe(true);
		expect(needsDetailPeaks(4096, 0.1, 500)).toBe(true);
	});
});

describe('computePeaksWindowFromPlanar', () => {
	it('preserves a transient inside the window at column resolution', () => {
		const samples = new Float32Array(100);
		samples[50] = 0.9;
		samples[51] = -0.7;
		const windowed = computePeaksWindowFromPlanar([samples], 40, 60, 10);
		let foundMax = -1;
		let foundMin = 1;
		for (let col = 0; col < 10; col += 1) {
			foundMax = Math.max(foundMax, windowed[col * 2 + 1] ?? -1);
			foundMin = Math.min(foundMin, windowed[col * 2] ?? 1);
		}
		expect(foundMax).toBeCloseTo(0.9, 5);
		expect(foundMin).toBeCloseTo(-0.7, 5);
	});

	it('approaches sample accuracy when columns exceed frames', () => {
		const samples = new Float32Array([0, 0.5, -0.25, 0]);
		const windowed = computePeaksWindowFromPlanar([samples], 0, 4, 4);
		expect(windowed[1]).toBeCloseTo(0, 5);
		expect(windowed[3]).toBeCloseTo(0.5, 5);
		expect(windowed[4]).toBeCloseTo(-0.25, 5);
		expect(windowed[7]).toBeCloseTo(0, 5);
	});
});
