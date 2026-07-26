/** Message protocol shared by peaks worker client and worker entry. */

export interface PeaksWorkerRequest {
	type: 'compute';
	id: string;
	/** Transferable planar channel buffers. */
	channels: Float32Array[];
	framesPerPeak: number;
}

export interface PeaksWorkerSuccess {
	type: 'result';
	id: string;
	channels: number;
	peakCount: number;
	framesPerPeak: number;
	data: Float32Array;
}

export interface PeaksWorkerFailure {
	type: 'error';
	id: string;
	message: string;
}

export type PeaksWorkerResponse = PeaksWorkerSuccess | PeaksWorkerFailure;
