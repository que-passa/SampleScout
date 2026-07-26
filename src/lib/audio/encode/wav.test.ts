import { describe, expect, it } from 'vitest';
import type { DecodedPlanarAudio } from '$lib/audio/decode';
import { encodeWav, wavByteLength } from './wav';

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

function readAscii(view: DataView, offset: number, length: number): string {
	let text = '';
	for (let i = 0; i < length; i += 1) {
		text += String.fromCharCode(view.getUint8(offset + i));
	}
	return text;
}

describe('encodeWav', () => {
	it('writes a valid PCM 16-bit WAV header and payload size', () => {
		const planar = makeTone({ seconds: 1, sampleRate: 8000, channels: 1 });
		const bytes = encodeWav(planar, 16);
		const view = new DataView(bytes);

		expect(readAscii(view, 0, 4)).toBe('RIFF');
		expect(readAscii(view, 8, 4)).toBe('WAVE');
		expect(readAscii(view, 12, 4)).toBe('fmt ');
		expect(view.getUint16(20, true)).toBe(1);
		expect(view.getUint16(22, true)).toBe(1);
		expect(view.getUint32(24, true)).toBe(8000);
		expect(view.getUint16(34, true)).toBe(16);
		expect(readAscii(view, 36, 4)).toBe('data');
		expect(view.getUint32(40, true)).toBe(8000 * 2);
		expect(bytes.byteLength).toBe(wavByteLength(8000, 1, 16));
	});

	it('preserves stereo channel count and 24-bit sample width', () => {
		const planar = makeTone({ seconds: 0.5, sampleRate: 1000, channels: 2 });
		const bytes = encodeWav(planar, 24);
		const view = new DataView(bytes);
		expect(view.getUint16(22, true)).toBe(2);
		expect(view.getUint16(34, true)).toBe(24);
		expect(view.getUint16(32, true)).toBe(6);
		expect(bytes.byteLength).toBe(wavByteLength(500, 2, 24));
	});

	it('matches expected duration from frame count and sample rate', () => {
		const planar = makeTone({ seconds: 2.5, sampleRate: 2000 });
		const bytes = encodeWav(planar, 16);
		const view = new DataView(bytes);
		const dataBytes = view.getUint32(40, true);
		const sampleRate = view.getUint32(24, true);
		const channels = view.getUint16(22, true);
		const bitDepth = view.getUint16(34, true);
		const duration = dataBytes / (sampleRate * channels * (bitDepth / 8));
		expect(duration).toBeCloseTo(2.5, 5);
	});

	it('clamps samples that exceed unit range', () => {
		const planar = makeTone({ seconds: 0.01, sampleRate: 100, amplitude: 2 });
		const bytes = encodeWav(planar, 16);
		const view = new DataView(bytes);
		expect(view.getInt16(44, true)).toBe(0x7fff);
	});
});
