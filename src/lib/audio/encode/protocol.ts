/** Message protocol for the MP3 encode worker. */

export interface Mp3WorkerEncodeRequest {
	type: 'encode';
	id: string;
	channels: Float32Array[];
	sampleRate: number;
	bitrateKbps: 96 | 128 | 192;
	chunkFrames?: number;
}

export interface Mp3WorkerCancelRequest {
	type: 'cancel';
	id: string;
}

export type Mp3WorkerRequest = Mp3WorkerEncodeRequest | Mp3WorkerCancelRequest;

export interface Mp3WorkerProgress {
	type: 'progress';
	id: string;
	fraction: number;
}

export interface Mp3WorkerResult {
	type: 'result';
	id: string;
	bytes: ArrayBuffer;
}

export interface Mp3WorkerError {
	type: 'error';
	id: string;
	message: string;
	canceled?: boolean;
}

export type Mp3WorkerResponse = Mp3WorkerProgress | Mp3WorkerResult | Mp3WorkerError;
