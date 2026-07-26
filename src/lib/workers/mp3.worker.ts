/// <reference lib="webworker" />

import { encodeMp3Planar } from '../audio/encode/mp3-core';
import type { Mp3WorkerRequest, Mp3WorkerResponse } from '../audio/encode/protocol';

const worker = self as DedicatedWorkerGlobalScope;

let activeId: string | null = null;
let activeAbort: AbortController | null = null;

worker.onmessage = (event: MessageEvent<Mp3WorkerRequest>) => {
	const message = event.data;
	if (!message) return;

	if (message.type === 'cancel') {
		if (activeId === message.id && activeAbort) {
			activeAbort.abort();
		}
		return;
	}

	if (message.type !== 'encode') return;
	void runEncode(message);
};

async function runEncode(message: Extract<Mp3WorkerRequest, { type: 'encode' }>): Promise<void> {
	if (activeAbort) {
		activeAbort.abort();
	}

	const abort = new AbortController();
	activeId = message.id;
	activeAbort = abort;

	try {
		const channels = (message.channels ?? []).map((channel) =>
			channel instanceof Float32Array ? channel : new Float32Array(channel)
		);
		const channelCount = channels.length;
		const frameCount = channels[0]?.length ?? 0;

		const encoded = await encodeMp3Planar(
			{
				channels,
				frameCount,
				durationSeconds: frameCount / message.sampleRate,
				channelCount,
				sampleRate: message.sampleRate
			},
			{
				bitrateKbps: message.bitrateKbps,
				chunkFrames: message.chunkFrames,
				signal: abort.signal,
				onProgress: (fraction) => {
					const response: Mp3WorkerResponse = {
						type: 'progress',
						id: message.id,
						fraction
					};
					worker.postMessage(response);
				}
			}
		);

		if (activeId !== message.id) return;

		const response: Mp3WorkerResponse = {
			type: 'result',
			id: message.id,
			bytes: encoded.buffer.slice(
				encoded.byteOffset,
				encoded.byteOffset + encoded.byteLength
			) as ArrayBuffer
		};
		worker.postMessage(response, [response.bytes]);
	} catch (cause) {
		if (activeId !== message.id) return;
		const canceled =
			(cause instanceof DOMException && cause.name === 'AbortError') ||
			(cause instanceof Error && cause.name === 'AbortError');
		const response: Mp3WorkerResponse = {
			type: 'error',
			id: message.id,
			canceled,
			message: canceled
				? 'MP3 encode canceled.'
				: cause instanceof Error
					? cause.message
					: 'MP3 encode failed.'
		};
		worker.postMessage(response);
	} finally {
		if (activeId === message.id) {
			activeId = null;
			activeAbort = null;
		}
	}
}
