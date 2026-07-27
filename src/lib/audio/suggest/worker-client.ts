import { SUGGEST_REGIONS_TIMEOUT_MS } from '$lib/config/suggest-regions';
import { createId } from '$lib/domain/ids';
import { suggestRegionsFromPlanar } from './index';
import type { SuggestRegionsWorkerRequest, SuggestRegionsWorkerResponse } from './protocol';
import type { SuggestRegionsResult } from './types';

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
		sharedWorker = new Worker(new URL('../../workers/suggest-regions.worker.ts', import.meta.url), {
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

/**
 * Suggest regions — tries a Worker, always falls back to the main thread.
 * Channel buffers may be transferred to the worker (copied first so callers keep PCM).
 */
export async function suggestRegionsAsync(
	channels: Float32Array[],
	sampleRate: number,
	durationSeconds?: number
): Promise<SuggestRegionsResult> {
	const worker = getWorker();
	if (!worker) {
		return suggestRegionsFromPlanar({ channels, sampleRate, durationSeconds });
	}

	const id = createId();
	const copies = channels.map((channel) => new Float32Array(channel));

	try {
		return await new Promise<SuggestRegionsResult>((resolve, reject) => {
			const timeout = window.setTimeout(() => {
				cleanup();
				reject(new Error('Suggest-regions worker timed out'));
			}, SUGGEST_REGIONS_TIMEOUT_MS);

			const onMessage = (event: MessageEvent<SuggestRegionsWorkerResponse>) => {
				const response = event.data;
				if (!response || response.id !== id) return;
				cleanup();
				if (response.type === 'error') {
					reject(new Error(response.message));
					return;
				}
				resolve({
					regions: response.regions,
					algorithmVersion: response.algorithmVersion
				});
			};

			const onError = () => {
				cleanup();
				reject(new Error('Suggest-regions worker failed to load'));
			};

			const cleanup = () => {
				window.clearTimeout(timeout);
				worker.removeEventListener('message', onMessage);
				worker.removeEventListener('error', onError);
			};

			worker.addEventListener('message', onMessage);
			worker.addEventListener('error', onError);

			const request: SuggestRegionsWorkerRequest = {
				type: 'suggest',
				id,
				channels: copies,
				sampleRate,
				durationSeconds
			};
			const transfer = copies.map((channel) => channel.buffer);
			worker.postMessage(request, transfer);
		});
	} catch {
		return suggestRegionsFromPlanar({ channels, sampleRate, durationSeconds });
	}
}
