/// <reference lib="webworker" />

import { computePeaksPlanar } from '../audio/peaks/compute';
import type { PeaksWorkerRequest, PeaksWorkerResponse } from '../audio/peaks/protocol';

const worker = self as DedicatedWorkerGlobalScope;

worker.onmessage = (event: MessageEvent<PeaksWorkerRequest>) => {
	const message = event.data;
	if (!message || message.type !== 'compute') return;

	try {
		const channels = (message.channels ?? []).map((channel) =>
			channel instanceof Float32Array ? channel : new Float32Array(channel)
		);
		const result = computePeaksPlanar({
			channels,
			framesPerPeak: message.framesPerPeak
		});
		const response: PeaksWorkerResponse = {
			type: 'result',
			id: message.id,
			channels: result.channels,
			peakCount: result.peakCount,
			framesPerPeak: result.framesPerPeak,
			data: result.data
		};
		worker.postMessage(response, [result.data.buffer]);
	} catch (cause) {
		const response: PeaksWorkerResponse = {
			type: 'error',
			id: message.id,
			message: cause instanceof Error ? cause.message : 'Peak computation failed.'
		};
		worker.postMessage(response);
	}
};
