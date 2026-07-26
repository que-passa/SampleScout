import { describe, expect, it } from 'vitest';
import { estimateEncodedByteLength, estimateMp3ByteLength, formatByteEstimate } from './estimate';
import { wavByteLength } from './wav';

describe('encode estimates', () => {
	it('matches exact WAV size for known geometry', () => {
		const estimate = estimateEncodedByteLength(2, 2, 48000, {
			format: 'wav',
			bitDepth: 16
		});
		expect(estimate).toBe(wavByteLength(96000, 2, 16));
	});

	it('estimates MP3 from CBR bitrate within tolerance of duration * rate', () => {
		const estimate = estimateMp3ByteLength(60, 128);
		expect(estimate).toBe(960_000);
		const viaSettings = estimateEncodedByteLength(60, 2, 44100, {
			format: 'mp3',
			bitrateKbps: 128
		});
		expect(viaSettings).toBe(960_000);
	});

	it('returns null for source pass-through', () => {
		expect(estimateEncodedByteLength(10, 1, 48000, { format: 'source' })).toBeNull();
	});

	it('formats byte estimates', () => {
		expect(formatByteEstimate(512)).toBe('512 B');
		expect(formatByteEstimate(2048)).toBe('2.0 KiB');
		expect(formatByteEstimate(2 * 1024 * 1024)).toBe('2.0 MiB');
	});
});
