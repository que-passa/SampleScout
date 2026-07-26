import type { DecodedPlanarAudio } from '$lib/audio/decode';
import { createAppError } from '$lib/domain/ids';

export type WavBitDepth = 16 | 24;

const WAV_HEADER_BYTES = 44;

/**
 * Encode planar float PCM (−1…1) to a little-endian PCM WAV ArrayBuffer.
 * Default 16-bit; optional 24-bit for higher fidelity exports.
 */
export function encodeWav(planar: DecodedPlanarAudio, bitDepth: WavBitDepth = 16): ArrayBuffer {
	const { channels, frameCount, channelCount, sampleRate } = planar;
	if (frameCount <= 0 || channelCount <= 0 || channels.length === 0) {
		throw createAppError('ENCODE_EMPTY', 'No PCM samples to encode as WAV.', {
			recoverable: true
		});
	}
	if (channelCount > 2) {
		throw createAppError('ENCODE_CHANNEL_LIMIT', 'WAV export supports mono or stereo only.', {
			recoverable: true,
			context: { channelCount }
		});
	}
	if (sampleRate <= 0 || !Number.isFinite(sampleRate)) {
		throw createAppError('ENCODE_BAD_RATE', 'Invalid sample rate for WAV encode.', {
			recoverable: true,
			context: { sampleRate }
		});
	}

	const bytesPerSample = bitDepth / 8;
	const blockAlign = channelCount * bytesPerSample;
	const dataBytes = frameCount * blockAlign;
	const buffer = new ArrayBuffer(WAV_HEADER_BYTES + dataBytes);
	const view = new DataView(buffer);

	writeAscii(view, 0, 'RIFF');
	view.setUint32(4, 36 + dataBytes, true);
	writeAscii(view, 8, 'WAVE');
	writeAscii(view, 12, 'fmt ');
	view.setUint32(16, 16, true); // PCM fmt chunk size
	view.setUint16(20, 1, true); // PCM format
	view.setUint16(22, channelCount, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * blockAlign, true);
	view.setUint16(32, blockAlign, true);
	view.setUint16(34, bitDepth, true);
	writeAscii(view, 36, 'data');
	view.setUint32(40, dataBytes, true);

	let offset = WAV_HEADER_BYTES;
	for (let frame = 0; frame < frameCount; frame += 1) {
		for (let ch = 0; ch < channelCount; ch += 1) {
			const sample = clampUnit(channels[ch]?.[frame] ?? 0);
			if (bitDepth === 16) {
				view.setInt16(offset, floatToInt16(sample), true);
				offset += 2;
			} else {
				writeInt24(view, offset, floatToInt24(sample));
				offset += 3;
			}
		}
	}

	return buffer;
}

/** Exact byte length for a WAV of the given PCM geometry. */
export function wavByteLength(
	frameCount: number,
	channelCount: number,
	bitDepth: WavBitDepth
): number {
	return WAV_HEADER_BYTES + frameCount * channelCount * (bitDepth / 8);
}

function writeAscii(view: DataView, offset: number, text: string): void {
	for (let i = 0; i < text.length; i += 1) {
		view.setUint8(offset + i, text.charCodeAt(i));
	}
}

function clampUnit(sample: number): number {
	if (sample > 1) return 1;
	if (sample < -1) return -1;
	return sample;
}

function floatToInt16(sample: number): number {
	return sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff);
}

function floatToInt24(sample: number): number {
	return sample < 0 ? Math.round(sample * 0x800000) : Math.round(sample * 0x7fffff);
}

function writeInt24(view: DataView, offset: number, value: number): void {
	const clamped = Math.max(-0x800000, Math.min(0x7fffff, value));
	const unsigned = clamped < 0 ? clamped + 0x1000000 : clamped;
	view.setUint8(offset, unsigned & 0xff);
	view.setUint8(offset + 1, (unsigned >> 8) & 0xff);
	view.setUint8(offset + 2, (unsigned >> 16) & 0xff);
}
