import { createAppError } from '$lib/domain/ids';

function getAudioContextCtor(): typeof AudioContext | undefined {
	if (typeof window === 'undefined') return undefined;
	return (
		window.AudioContext ||
		(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
	);
}

function getOfflineAudioContextCtor(): typeof OfflineAudioContext | undefined {
	if (typeof window === 'undefined') return undefined;
	return (
		window.OfflineAudioContext ||
		(window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
			.webkitOfflineAudioContext
	);
}

export interface DecodedAudioSummary {
	durationSeconds: number;
	channelCount: number;
	sampleRate: number;
}

export interface DecodedPlanarAudio {
	channels: Float32Array[];
	frameCount: number;
	durationSeconds: number;
	channelCount: number;
	sampleRate: number;
}

/**
 * Ensure the blob has a usable audio MIME type for decodeAudioData.
 * OPFS File handles often report an empty `type`.
 */
export async function blobWithAudioType(blob: Blob, mimeType?: string): Promise<Blob> {
	const type = (mimeType || blob.type || '').trim();
	if (!type || blob.type === type) return blob;
	const bytes = await blob.arrayBuffer();
	return new Blob([bytes], { type });
}

async function decodeArrayBuffer(buffer: ArrayBuffer): Promise<AudioBuffer> {
	const OfflineCtor = getOfflineAudioContextCtor();
	if (OfflineCtor) {
		try {
			// Decode-only context: no autoplay gesture, no close() invalidation of PCM.
			const offline = new OfflineCtor(1, 128, 44100);
			return await offline.decodeAudioData(buffer.slice(0));
		} catch {
			/* try AudioContext below */
		}
	}

	const AudioContextCtor = getAudioContextCtor();
	if (!AudioContextCtor) {
		throw createAppError('WEBAUDIO_UNSUPPORTED', 'Web Audio is unavailable for decode.', {
			recoverable: true
		});
	}

	const context = new AudioContextCtor();
	try {
		return await context.decodeAudioData(buffer.slice(0));
	} catch (cause) {
		throw createAppError('DECODE_FAILED', 'Could not decode recorded audio.', {
			cause,
			recoverable: true
		});
	} finally {
		await context.close().catch(() => undefined);
	}
}

/**
 * Decode a blob enough to read duration / channel metadata.
 * Releases the AudioBuffer immediately; callers should not retain decoded PCM.
 */
export async function decodeAudioSummary(blob: Blob): Promise<DecodedAudioSummary> {
	const audioBuffer = await decodeArrayBuffer(await blob.arrayBuffer());
	try {
		return {
			durationSeconds: audioBuffer.duration,
			channelCount: audioBuffer.numberOfChannels,
			sampleRate: audioBuffer.sampleRate
		};
	} finally {
		releaseAudioBuffer(audioBuffer);
	}
}

/**
 * Full decode for peak generation / offline work.
 * Prefer {@link decodeAudioPlanar} when you need PCM samples.
 */
export async function decodeAudioBuffer(blob: Blob): Promise<AudioBuffer> {
	return decodeArrayBuffer(await blob.arrayBuffer());
}

/**
 * Decode and copy planar PCM. Copies channel data immediately after decode.
 */
export async function decodeAudioPlanar(
	blob: Blob,
	mimeType?: string
): Promise<DecodedPlanarAudio> {
	const typed = await blobWithAudioType(blob, mimeType);
	let lastError: unknown;

	// Try typed blob first, then raw bytes (some engines ignore/ mis-handle MIME).
	for (const candidate of [typed, blob]) {
		try {
			const audioBuffer = await decodeArrayBuffer(await candidate.arrayBuffer());
			try {
				const channels: Float32Array[] = [];
				for (let ch = 0; ch < audioBuffer.numberOfChannels; ch += 1) {
					channels.push(new Float32Array(audioBuffer.getChannelData(ch)));
				}
				return {
					channels,
					frameCount: audioBuffer.length,
					durationSeconds: audioBuffer.duration,
					channelCount: audioBuffer.numberOfChannels,
					sampleRate: audioBuffer.sampleRate
				};
			} finally {
				releaseAudioBuffer(audioBuffer);
			}
		} catch (cause) {
			lastError = cause;
		}
	}

	if (lastError && typeof lastError === 'object' && 'code' in lastError) {
		throw lastError;
	}
	throw createAppError('DECODE_FAILED', 'Could not decode recorded audio.', {
		cause: lastError,
		recoverable: true
	});
}

/**
 * Best-effort release hint for decoded PCM. AudioBuffer itself is GC'd;
 * this zeroes channel data when possible to drop large typed-array retention sooner.
 */
export function releaseAudioBuffer(buffer: AudioBuffer): void {
	try {
		for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
			const data = buffer.getChannelData(ch);
			data.fill(0);
		}
	} catch {
		/* ignore */
	}
}
