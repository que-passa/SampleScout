import type { DecodedPlanarAudio } from '$lib/audio/decode';
import { createId } from '$lib/domain/ids';
import { encodeMp3Planar, type EncodeMp3CoreOptions } from './mp3-core';
import type { Mp3WorkerRequest, Mp3WorkerResponse } from './protocol';

let sharedWorker: Worker | null = null;
let workerFailed = false;
let preferWorker = true;

function canUseWorker(): boolean {
	return preferWorker && typeof Worker !== 'undefined' && !workerFailed;
}

function getWorker(): Worker | null {
	if (!canUseWorker()) return null;
	if (sharedWorker) return sharedWorker;
	try {
		sharedWorker = new Worker(new URL('../../workers/mp3.worker.ts', import.meta.url), {
			type: 'module'
		});
		sharedWorker.addEventListener('error', () => {
			workerFailed = true;
			preferWorker = false;
			sharedWorker?.terminate();
			sharedWorker = null;
		});
		return sharedWorker;
	} catch {
		workerFailed = true;
		preferWorker = false;
		return null;
	}
}

export type EncodeMp3AsyncOptions = EncodeMp3CoreOptions;

/**
 * Encode MP3 off the main thread when Workers are available; otherwise run in-place.
 * Progress and AbortSignal work in both paths. Caller PCM is never detached.
 */
export async function encodeMp3Async(
	planar: DecodedPlanarAudio,
	options: EncodeMp3AsyncOptions
): Promise<Uint8Array> {
	const worker = getWorker();
	if (!worker) {
		return encodeMp3Planar(planar, options);
	}

	const id = createId();
	const channelCopies = planar.channels.map((channel) => channel.slice());
	const transfer = channelCopies
		.map((channel) => channel.buffer)
		.filter((buffer): buffer is ArrayBuffer => buffer instanceof ArrayBuffer);

	try {
		return await new Promise<Uint8Array>((resolve, reject) => {
			const onAbort = () => {
				const cancel: Mp3WorkerRequest = { type: 'cancel', id };
				worker.postMessage(cancel);
			};

			if (options.signal?.aborted) {
				reject(new DOMException('MP3 encode canceled.', 'AbortError'));
				return;
			}

			options.signal?.addEventListener('abort', onAbort, { once: true });

			const onMessage = (event: MessageEvent<Mp3WorkerResponse>) => {
				const response = event.data;
				if (!response || response.id !== id) return;

				if (response.type === 'progress') {
					options.onProgress?.(response.fraction);
					return;
				}

				cleanup();
				if (response.type === 'error') {
					if (response.canceled) {
						reject(new DOMException('MP3 encode canceled.', 'AbortError'));
						return;
					}
					reject(new Error(response.message));
					return;
				}

				resolve(new Uint8Array(response.bytes));
			};

			const onError = () => {
				cleanup();
				reject(new Error('MP3 worker failed to load'));
			};

			const cleanup = () => {
				options.signal?.removeEventListener('abort', onAbort);
				worker.removeEventListener('message', onMessage);
				worker.removeEventListener('error', onError);
			};

			worker.addEventListener('message', onMessage);
			worker.addEventListener('error', onError);

			const request: Mp3WorkerRequest = {
				type: 'encode',
				id,
				channels: channelCopies,
				sampleRate: planar.sampleRate,
				bitrateKbps: options.bitrateKbps,
				chunkFrames: options.chunkFrames
			};

			try {
				worker.postMessage(request, transfer);
			} catch (cause) {
				cleanup();
				reject(cause instanceof Error ? cause : new Error('MP3 worker postMessage failed'));
			}
		});
	} catch (cause) {
		if (shouldFallbackToMain(cause)) {
			workerFailed = true;
			preferWorker = false;
			sharedWorker?.terminate();
			sharedWorker = null;
			return encodeMp3Planar(planar, options);
		}
		throw cause;
	}
}

function shouldFallbackToMain(cause: unknown): boolean {
	if (workerFailed) return true;
	const message = cause instanceof Error ? cause.message : String(cause);
	return /DataCloneError|could not be cloned|failed to load|postMessage failed/i.test(message);
}
