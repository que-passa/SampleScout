import { computePeaksPlanar, type PeakComputeResult } from './compute';
import type { PeaksWorkerRequest, PeaksWorkerResponse } from './protocol';
import { createId } from '$lib/domain/ids';

const WORKER_TIMEOUT_MS = 8_000;

let sharedWorker: Worker | null = null;
let workerFailed = false;
/** Main-thread compute is the reliable default; worker is best-effort. */
let preferWorker = true;

function canUseWorker(): boolean {
	return preferWorker && typeof Worker !== 'undefined' && !workerFailed;
}

function getWorker(): Worker | null {
	if (!canUseWorker()) return null;
	if (sharedWorker) return sharedWorker;
	try {
		sharedWorker = new Worker(new URL('../../workers/peaks.worker.ts', import.meta.url), {
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
 * Compute peaks — tries a worker, always falls back to the main thread.
 */
export async function computePeaksAsync(
	channels: Float32Array[],
	framesPerPeak: number
): Promise<PeakComputeResult> {
	const worker = getWorker();
	if (!worker) {
		return computePeaksPlanar({ channels, framesPerPeak });
	}

	const id = createId();

	try {
		const result = await new Promise<PeakComputeResult>((resolve, reject) => {
			const timeout = window.setTimeout(() => {
				cleanup();
				reject(new Error('Peak worker timed out'));
			}, WORKER_TIMEOUT_MS);

			const onMessage = (event: MessageEvent<PeaksWorkerResponse>) => {
				const response = event.data;
				if (!response || response.id !== id) return;
				cleanup();
				if (response.type === 'error') {
					reject(new Error(response.message));
					return;
				}
				const data =
					response.data instanceof Float32Array
						? response.data
						: new Float32Array(response.data as ArrayLike<number>);
				resolve({
					channels: response.channels,
					peakCount: response.peakCount,
					framesPerPeak: response.framesPerPeak,
					data
				});
			};

			const onError = () => {
				cleanup();
				reject(new Error('Peak worker failed to load'));
			};

			const cleanup = () => {
				window.clearTimeout(timeout);
				worker.removeEventListener('message', onMessage);
				worker.removeEventListener('error', onError);
			};

			worker.addEventListener('message', onMessage);
			worker.addEventListener('error', onError);

			const request: PeaksWorkerRequest = {
				type: 'compute',
				id,
				channels,
				framesPerPeak
			};
			try {
				worker.postMessage(request);
			} catch (cause) {
				cleanup();
				reject(cause instanceof Error ? cause : new Error('Peak worker postMessage failed'));
			}
		});
		return result;
	} catch {
		workerFailed = true;
		preferWorker = false;
		sharedWorker?.terminate();
		sharedWorker = null;
		return computePeaksPlanar({ channels, framesPerPeak });
	}
}
