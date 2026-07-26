/** Request/response protocol for OPFS write worker (Safari-safe sync access handle). */

export type OpfsWriteWorkerRequest = {
	type: 'write';
	id: string;
	/** Slash-separated path under OPFS root (e.g. sessions/.../source.webm). */
	path: string;
	data: ArrayBuffer;
};

export type OpfsWriteWorkerResponse =
	| { type: 'result'; id: string; byteLength: number }
	| { type: 'error'; id: string; message: string };
