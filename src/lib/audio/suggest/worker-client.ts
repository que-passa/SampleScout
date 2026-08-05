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

function isAbortError(cause: unknown): boolean {
	return (
		(cause instanceof DOMException && cause.name === 'AbortError') ||
		(cause instanceof Error && cause.name === 'AbortError')
	);
}

function abortError(): DOMException {
	return new DOMException('Suggest-regions analysis aborted', 'AbortError');
}

function throwIfAborted(signal?: AbortSignal): void {
	if (signal?.aborted) throw abortError();
}

export interface SuggestRegionsAsyncOptions {
	signal?: AbortSignal;
	/** Hard timeout; defaults to {@link SUGGEST_REGIONS_TIMEOUT_MS}. */
	timeoutMs?: number;
}

export interface SuggestRegionsAsyncResult extends SuggestRegionsResult {
	/** Wall time spent in Worker or main-thread analysis (ms). */
	elapsedMs: number;
}

/**
 * Suggest regions — tries a Worker, falls back to main thread on Worker failure.
 * Abort and hard-timeout do not fall through to main thread.
 * Channel buffers may be transferred to the worker (copied first so callers keep PCM).
 */
export async function suggestRegionsAsync(
	channels: Float32Array[],
	sampleRate: number,
	durationSeconds?: number,
	options?: SuggestRegionsAsyncOptions
): Promise<SuggestRegionsAsyncResult> {
	throwIfAborted(options?.signal);

	const timeoutMs = options?.timeoutMs ?? SUGGEST_REGIONS_TIMEOUT_MS;
	const worker = getWorker();
	if (!worker) {
		return runOnMainThread(channels, sampleRate, durationSeconds, options?.signal, timeoutMs);
	}

	const id = createId();
	const copies = channels.map((channel) => new Float32Array(channel));
	const started = performance.now();

	try {
		const result = await new Promise<SuggestRegionsResult>((resolve, reject) => {
			let settled = false;

			const finish = (fn: () => void) => {
				if (settled) return;
				settled = true;
				cleanup();
				fn();
			};

			const timeout = window.setTimeout(() => {
				finish(() => reject(new Error('Suggest-regions worker timed out')));
			}, timeoutMs);

			const onAbort = () => {
				finish(() => reject(abortError()));
			};

			const onMessage = (event: MessageEvent<SuggestRegionsWorkerResponse>) => {
				const response = event.data;
				if (!response || response.id !== id) return;
				finish(() => {
					if (response.type === 'error') {
						reject(new Error(response.message));
						return;
					}
					resolve({
						regions: response.regions,
						algorithmVersion: response.algorithmVersion
					});
				});
			};

			const onError = () => {
				finish(() => reject(new Error('Suggest-regions worker failed to load')));
			};

			const cleanup = () => {
				window.clearTimeout(timeout);
				worker.removeEventListener('message', onMessage);
				worker.removeEventListener('error', onError);
				options?.signal?.removeEventListener('abort', onAbort);
			};

			worker.addEventListener('message', onMessage);
			worker.addEventListener('error', onError);
			if (options?.signal) {
				options.signal.addEventListener('abort', onAbort, { once: true });
				if (options.signal.aborted) {
					onAbort();
					return;
				}
			}

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

		return { ...result, elapsedMs: performance.now() - started };
	} catch (cause) {
		if (isAbortError(cause)) throw cause;
		if (cause instanceof Error && cause.message.includes('timed out')) throw cause;
		// Worker transport failure → main-thread fallback (still timeout / cancel bound).
		return runOnMainThread(channels, sampleRate, durationSeconds, options?.signal, timeoutMs);
	}
}

async function runOnMainThread(
	channels: Float32Array[],
	sampleRate: number,
	durationSeconds: number | undefined,
	signal: AbortSignal | undefined,
	timeoutMs: number
): Promise<SuggestRegionsAsyncResult> {
	throwIfAborted(signal);
	const started = performance.now();

	const result = await new Promise<SuggestRegionsResult>((resolve, reject) => {
		let settled = false;
		const timeout = window.setTimeout(() => {
			finish(() => reject(new Error('Suggest-regions analysis timed out')));
		}, timeoutMs);

		const onAbort = () => {
			finish(() => reject(abortError()));
		};

		const finish = (fn: () => void) => {
			if (settled) return;
			settled = true;
			window.clearTimeout(timeout);
			signal?.removeEventListener('abort', onAbort);
			fn();
		};

		if (signal) {
			signal.addEventListener('abort', onAbort, { once: true });
			if (signal.aborted) {
				onAbort();
				return;
			}
		}

		// Yield so abort/timeout can win before sync work starts on a busy main thread.
		window.setTimeout(() => {
			if (settled) return;
			try {
				throwIfAborted(signal);
				const analyzed = suggestRegionsFromPlanar({ channels, sampleRate, durationSeconds });
				finish(() => resolve(analyzed));
			} catch (cause) {
				finish(() => reject(cause instanceof Error ? cause : new Error(String(cause))));
			}
		}, 0);
	});

	return { ...result, elapsedMs: performance.now() - started };
}
