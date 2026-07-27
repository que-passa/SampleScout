import { describe, expect, it } from 'vitest';
import { measureChannelPeak, normalizeChannelLayout } from './channels';

describe('normalizeChannelLayout', () => {
	it('keeps true mono as-is', () => {
		const mono = new Float32Array([0, 0.5, -0.25]);
		const result = normalizeChannelLayout([mono]);
		expect(result.channelCount).toBe(1);
		expect(result.channels).toHaveLength(1);
		expect(result.channels[0]).toBe(mono);
	});

	it('collapses stereo with only the left channel carrying audio', () => {
		const left = new Float32Array([0, 0.8, -0.4]);
		const right = new Float32Array(left.length);
		const result = normalizeChannelLayout([left, right]);
		expect(result.channelCount).toBe(1);
		expect(result.channels[0]).toBe(left);
	});

	it('keeps stereo when both channels carry independent audio', () => {
		const left = new Float32Array([0.8, 0, 0]);
		const right = new Float32Array([0, 0, 0.7]);
		const result = normalizeChannelLayout([left, right]);
		expect(result.channelCount).toBe(2);
		expect(result.channels).toHaveLength(2);
	});

	it('uses the loudest channel when only one side is active', () => {
		const left = new Float32Array(4);
		const right = new Float32Array([0, 0.6, -0.2, 0]);
		const result = normalizeChannelLayout([left, right]);
		expect(result.channelCount).toBe(1);
		expect(result.channels[0]).toBe(right);
	});
});

describe('measureChannelPeak', () => {
	it('returns the maximum absolute sample', () => {
		const channel = new Float32Array([0.1, -0.9, 0.2]);
		expect(measureChannelPeak(channel)).toBeCloseTo(0.9);
	});
});
