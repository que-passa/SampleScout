import type { DecodedPlanarAudio } from '$lib/audio/decode';
import { createAppError } from '$lib/domain/ids';
import type { OutputSettings } from '$lib/domain/types';
import { hashBytes } from './hash';
import { encodeMp3Async } from './worker-client';
import { encodeWav } from './wav';

export interface EncodedAudio {
	bytes: ArrayBuffer;
	mimeType: string;
	byteLength: number;
	hash: string;
	extension: 'wav' | 'mp3';
	format: 'wav' | 'mp3';
}

export interface EncodePlanarOptions {
	signal?: AbortSignal;
	/** 0…1 while encoding (WAV jumps 0→1; MP3 reports chunk progress). */
	onProgress?: (fraction: number) => void;
}

/**
 * Encode rendered planar PCM to WAV or MP3 per output settings.
 * `format: 'source'` is not an encode path — upload may pass through the original file.
 */
export async function encodePlanar(
	planar: DecodedPlanarAudio,
	output: OutputSettings,
	options: EncodePlanarOptions = {}
): Promise<EncodedAudio> {
	if (output.format === 'source') {
		throw createAppError(
			'ENCODE_SOURCE_PASSTHROUGH',
			'Source-format upload skips encode; use the original file.',
			{ recoverable: true }
		);
	}

	if (options.signal?.aborted) {
		throw new DOMException('Encode canceled.', 'AbortError');
	}

	if (output.format === 'wav') {
		options.onProgress?.(0);
		const bytes = encodeWav(planar, output.bitDepth);
		options.onProgress?.(1);
		const hash = await hashBytes(bytes);
		return {
			bytes,
			mimeType: 'audio/wav',
			byteLength: bytes.byteLength,
			hash,
			extension: 'wav',
			format: 'wav'
		};
	}

	const encoded = await encodeMp3Async(planar, {
		bitrateKbps: output.bitrateKbps,
		signal: options.signal,
		onProgress: options.onProgress
	});
	const bytes = encoded.buffer.slice(
		encoded.byteOffset,
		encoded.byteOffset + encoded.byteLength
	) as ArrayBuffer;
	const hash = await hashBytes(bytes);
	return {
		bytes,
		mimeType: 'audio/mpeg',
		byteLength: bytes.byteLength,
		hash,
		extension: 'mp3',
		format: 'mp3'
	};
}
