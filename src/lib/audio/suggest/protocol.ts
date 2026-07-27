/** Message protocol for suggest-regions worker. */

export interface SuggestRegionsWorkerRequest {
	type: 'suggest';
	id: string;
	channels: Float32Array[];
	sampleRate: number;
	durationSeconds?: number;
}

export interface SuggestRegionsWorkerSuccess {
	type: 'result';
	id: string;
	regions: { startSeconds: number; endSeconds: number }[];
	algorithmVersion: number;
}

export interface SuggestRegionsWorkerFailure {
	type: 'error';
	id: string;
	message: string;
}

export type SuggestRegionsWorkerResponse =
	SuggestRegionsWorkerSuccess | SuggestRegionsWorkerFailure;
