import { describe, expect, it } from 'vitest';
import type { DecodedPlanarAudio } from '$lib/audio/decode';
import { encodeMp3Planar } from './mp3-core';

function makeTone(seconds = 0.25): DecodedPlanarAudio {
	const sampleRate = 44100;
	const frameCount = Math.round(seconds * sampleRate);
	const data = new Float32Array(frameCount);
	for (let i = 0; i < frameCount; i += 1) {
		data[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.4;
	}
	return {
		channels: [data],
		frameCount,
		durationSeconds: seconds,
		channelCount: 1,
		sampleRate
	};
}

describe('encodeMp3Planar', () => {
	it('produces an MPEG frame sync header for a short mono tone', async () => {
		const planar = makeTone(0.25);
		const bytes = await encodeMp3Planar(planar, { bitrateKbps: 128 });
		expect(bytes.byteLength).toBeGreaterThan(100);
		// MPEG audio frame sync: 0xFFEx
		expect(bytes[0]).toBe(0xff);
		expect((bytes[1] ?? 0) & 0xe0).toBe(0xe0);
	}, 30_000);

	it('honors abort between chunks', async () => {
		const planar = makeTone(1);
		const controller = new AbortController();
		controller.abort();
		await expect(
			encodeMp3Planar(planar, { bitrateKbps: 96, signal: controller.signal })
		).rejects.toMatchObject({ name: 'AbortError' });
	});

	it('reports progress to completion', async () => {
		const planar = makeTone(0.5);
		const fractions: number[] = [];
		await encodeMp3Planar(planar, {
			bitrateKbps: 192,
			chunkFrames: 2048,
			onProgress: (fraction) => fractions.push(fraction)
		});
		expect(fractions.length).toBeGreaterThan(0);
		expect(fractions.at(-1)).toBe(1);
	}, 30_000);
});
