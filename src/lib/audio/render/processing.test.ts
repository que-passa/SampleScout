import { describe, expect, it } from 'vitest';
import { applyHighPassInPlace, applyNoiseGateInPlace, applySoftLimitInPlace } from './processing';

function makeTone(opts: {
	seconds: number;
	sampleRate?: number;
	frequency?: number;
	amplitude?: number;
}): Float32Array[] {
	const sampleRate = opts.sampleRate ?? 48000;
	const frequency = opts.frequency ?? 30;
	const amplitude = opts.amplitude ?? 0.5;
	const frameCount = Math.round(opts.seconds * sampleRate);
	const channel = new Float32Array(frameCount);
	for (let i = 0; i < frameCount; i += 1) {
		channel[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate);
	}
	return [channel];
}

function measurePeak(channels: Float32Array[]): number {
	let peak = 0;
	for (const channel of channels) {
		for (const sample of channel) {
			peak = Math.max(peak, Math.abs(sample));
		}
	}
	return peak;
}

describe('applyHighPassInPlace', () => {
	it('attenuates low-frequency rumble', () => {
		const channels = makeTone({ seconds: 0.5, frequency: 30, amplitude: 0.8 });
		const before = measurePeak(channels);
		applyHighPassInPlace(channels, 48000, 80);
		const after = measurePeak(channels);
		expect(after).toBeLessThan(before * 0.35);
	});
});

describe('applyNoiseGateInPlace', () => {
	it('attenuates quiet sections', () => {
		const sampleRate = 1000;
		const channel = new Float32Array(sampleRate);
		for (let i = 0; i < sampleRate; i += 1) {
			channel[i] = i < 500 ? 0.02 : 0.5;
		}
		const channels = [channel];
		applyNoiseGateInPlace(channels, sampleRate, -30);
		const quietPeak = Math.max(...Array.from(channel.slice(0, 500)).map(Math.abs));
		const loudPeak = Math.max(...Array.from(channel.slice(500)).map(Math.abs));
		expect(quietPeak).toBeLessThan(0.02);
		expect(loudPeak).toBeGreaterThan(0.2);
	});
});

describe('applySoftLimitInPlace', () => {
	it('caps peaks near the ceiling', () => {
		const channel = new Float32Array([0, 0.5, 1.2, -1.3, 0.2]);
		const channels = [channel];
		applySoftLimitInPlace(channels, -1);
		const ceiling = Math.pow(10, -1 / 20);
		expect(measurePeak(channels)).toBeLessThanOrEqual(ceiling + 1e-6);
	});
});
