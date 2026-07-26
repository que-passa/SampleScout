import { createMp3Encoder } from 'wasm-media-encoders';
import type { DecodedPlanarAudio } from '$lib/audio/decode';
import { createAppError } from '$lib/domain/ids';
import type { Mp3BitrateKbps } from './estimate';

/** ~0.25 s of PCM per encode tick — keeps progress responsive without tiny LAME calls. */
const DEFAULT_CHUNK_FRAMES = 11_520;

export interface EncodeMp3CoreOptions {
	bitrateKbps: Mp3BitrateKbps;
	/** Abort between chunks. */
	signal?: AbortSignal;
	onProgress?: (fraction: number) => void;
	chunkFrames?: number;
}

/**
 * Encode planar float PCM to MP3 (CBR) using LAME via wasm-media-encoders.
 * Safe to call from a worker; yields progress between chunks for cancellation.
 */
export async function encodeMp3Planar(
	planar: DecodedPlanarAudio,
	options: EncodeMp3CoreOptions
): Promise<Uint8Array> {
	const channelCount = planar.channelCount;
	if (channelCount !== 1 && channelCount !== 2) {
		throw createAppError('ENCODE_CHANNEL_LIMIT', 'MP3 export supports mono or stereo only.', {
			recoverable: true,
			context: { channelCount }
		});
	}
	if (planar.frameCount <= 0 || planar.channels.length === 0) {
		throw createAppError('ENCODE_EMPTY', 'No PCM samples to encode as MP3.', {
			recoverable: true
		});
	}
	if (options.signal?.aborted) {
		throw abortError();
	}

	const encoder = await createMp3Encoder();
	encoder.configure({
		channels: channelCount,
		sampleRate: planar.sampleRate,
		bitrate: options.bitrateKbps
	});

	const chunkFrames = Math.max(1152, options.chunkFrames ?? DEFAULT_CHUNK_FRAMES);
	const parts: Uint8Array[] = [];
	let totalBytes = 0;
	const totalFrames = planar.frameCount;

	for (let start = 0; start < totalFrames; start += chunkFrames) {
		if (options.signal?.aborted) {
			throw abortError();
		}
		const end = Math.min(totalFrames, start + chunkFrames);
		const slices = planar.channels
			.slice(0, channelCount)
			.map((channel) => channel.subarray(start, end));
		const encoded = encoder.encode(slices);
		if (encoded.length > 0) {
			const copy = encoded.slice();
			parts.push(copy);
			totalBytes += copy.length;
		}
		options.onProgress?.(Math.min(0.99, end / totalFrames));
	}

	if (options.signal?.aborted) {
		throw abortError();
	}

	const tail = encoder.finalize();
	if (tail.length > 0) {
		const copy = tail.slice();
		parts.push(copy);
		totalBytes += copy.length;
	}

	options.onProgress?.(1);

	const out = new Uint8Array(totalBytes);
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.length;
	}
	return out;
}

function abortError(): DOMException {
	return new DOMException('MP3 encode canceled.', 'AbortError');
}
