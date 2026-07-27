/// <reference lib="webworker" />

import { suggestRegionsFromPlanar } from '../audio/suggest/index';
import type {
	SuggestRegionsWorkerRequest,
	SuggestRegionsWorkerResponse
} from '../audio/suggest/protocol';

const worker = self as DedicatedWorkerGlobalScope;

worker.onmessage = (event: MessageEvent<SuggestRegionsWorkerRequest>) => {
	const message = event.data;
	if (!message || message.type !== 'suggest') return;

	try {
		const channels = (message.channels ?? []).map((channel) =>
			channel instanceof Float32Array ? channel : new Float32Array(channel)
		);
		const result = suggestRegionsFromPlanar({
			channels,
			sampleRate: message.sampleRate,
			durationSeconds: message.durationSeconds
		});
		const response: SuggestRegionsWorkerResponse = {
			type: 'result',
			id: message.id,
			regions: result.regions,
			algorithmVersion: result.algorithmVersion
		};
		worker.postMessage(response);
	} catch (cause) {
		const response: SuggestRegionsWorkerResponse = {
			type: 'error',
			id: message.id,
			message: cause instanceof Error ? cause.message : 'Region suggestion failed.'
		};
		worker.postMessage(response);
	}
};
