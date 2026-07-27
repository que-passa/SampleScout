import { createAppError, createId } from '$lib/domain/ids';
import type { AppError, FileRef } from '$lib/domain/types';
import type { OpfsWriteWorkerRequest, OpfsWriteWorkerResponse } from './opfs-write-protocol';

export interface OpfsWriteResult {
	fileRef: FileRef;
	byteLength: number;
}

const WORKER_TIMEOUT_MS = 60_000;

let sharedWorker: Worker | null = null;
let workerFailed = false;

function splitPath(path: string): string[] {
	return path.split('/').filter(Boolean);
}

async function getDirectoryHandle(
	root: FileSystemDirectoryHandle,
	segments: string[],
	create: boolean
): Promise<FileSystemDirectoryHandle> {
	let current = root;
	for (const segment of segments) {
		current = await current.getDirectoryHandle(segment, { create });
	}
	return current;
}

export async function getOpfsRoot(): Promise<FileSystemDirectoryHandle> {
	if (!navigator.storage?.getDirectory) {
		throw createAppError('OPFS_UNSUPPORTED', 'Origin Private File System is unavailable.', {
			recoverable: false
		});
	}
	return navigator.storage.getDirectory();
}

function supportsCreateWritable(handle: FileSystemFileHandle): boolean {
	return typeof handle.createWritable === 'function';
}

async function toArrayBuffer(data: Blob | ArrayBuffer | Uint8Array): Promise<ArrayBuffer> {
	if (data instanceof ArrayBuffer) return data;
	if (data instanceof Uint8Array) {
		return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
	}
	return data.arrayBuffer();
}

function getWriteWorker(): Worker | null {
	if (workerFailed || typeof Worker === 'undefined') return null;
	if (sharedWorker) return sharedWorker;
	try {
		sharedWorker = new Worker(new URL('../workers/opfs-write.worker.ts', import.meta.url), {
			type: 'module'
		});
		sharedWorker.addEventListener('error', () => {
			workerFailed = true;
			sharedWorker?.terminate();
			sharedWorker = null;
		});
		return sharedWorker;
	} catch {
		workerFailed = true;
		return null;
	}
}

async function writeViaSyncAccessWorker(path: FileRef, data: ArrayBuffer): Promise<number> {
	const worker = getWriteWorker();
	if (!worker) {
		throw createAppError(
			'OPFS_WRITE_UNSUPPORTED',
			'This browser cannot write local audio files (OPFS createWritable / sync handle unavailable). Try Chrome or update Safari.',
			{ recoverable: true, context: { path } }
		);
	}

	const id = createId();
	const request: OpfsWriteWorkerRequest = { type: 'write', id, path, data };

	return await new Promise<number>((resolve, reject) => {
		const timeout = window.setTimeout(() => {
			cleanup();
			reject(
				createAppError('SOURCE_SAVE_FAILED', 'Timed out writing audio to local storage.', {
					recoverable: true,
					context: { path }
				})
			);
		}, WORKER_TIMEOUT_MS);

		const onMessage = (event: MessageEvent<OpfsWriteWorkerResponse>) => {
			const response = event.data;
			if (!response || response.id !== id) return;
			cleanup();
			if (response.type === 'result') {
				resolve(response.byteLength);
				return;
			}
			reject(
				createAppError('SOURCE_SAVE_FAILED', response.message || 'Failed to write audio binary.', {
					recoverable: true,
					context: { path }
				})
			);
		};

		const onError = () => {
			cleanup();
			workerFailed = true;
			reject(
				createAppError('SOURCE_SAVE_FAILED', 'OPFS write worker failed.', {
					recoverable: true,
					context: { path }
				})
			);
		};

		const cleanup = () => {
			window.clearTimeout(timeout);
			worker.removeEventListener('message', onMessage);
			worker.removeEventListener('error', onError);
		};

		worker.addEventListener('message', onMessage);
		worker.addEventListener('error', onError);
		worker.postMessage(request, [data]);
	});
}

async function writeViaCreateWritable(
	handle: FileSystemFileHandle,
	data: Blob | ArrayBuffer | Uint8Array,
	path: FileRef
): Promise<number> {
	const writable = await handle.createWritable();

	try {
		if (data instanceof Blob) {
			await writable.write(data);
		} else if (data instanceof ArrayBuffer) {
			await writable.write(data);
		} else {
			const copy = new Uint8Array(data.byteLength);
			copy.set(data);
			await writable.write(copy);
		}
		await writable.close();
	} catch (cause) {
		try {
			await writable.abort();
		} catch {
			/* ignore abort failures */
		}
		throw createAppError('SOURCE_SAVE_FAILED', 'Failed to write audio binary to OPFS.', {
			cause,
			recoverable: true,
			context: { path }
		});
	}

	const file = await handle.getFile();
	return file.size;
}

/**
 * Write bytes to OPFS.
 * Prefers `createWritable` (Chrome/Edge); falls back to a worker + `createSyncAccessHandle`
 * for Safari / browsers without async OPFS writers.
 */
export async function writeBinary(
	path: FileRef,
	data: Blob | ArrayBuffer | Uint8Array
): Promise<OpfsWriteResult> {
	const root = await getOpfsRoot();
	const segments = splitPath(path);
	const fileName = segments.pop();
	if (!fileName) {
		throw createAppError('OPFS_INVALID_PATH', 'Binary path must include a file name.', {
			recoverable: false,
			context: { path }
		});
	}

	const directory = await getDirectoryHandle(root, segments, true);
	const handle = await directory.getFileHandle(fileName, { create: true });

	let byteLength: number;
	if (supportsCreateWritable(handle)) {
		try {
			byteLength = await writeViaCreateWritable(handle, data, path);
		} catch (cause) {
			// Some engines advertise the method but fail at runtime — try sync handle next.
			const appError = cause as AppError;
			if (appError?.code === 'SOURCE_SAVE_FAILED') {
				const buffer = await toArrayBuffer(data);
				byteLength = await writeViaSyncAccessWorker(path, buffer);
			} else {
				throw cause;
			}
		}
	} else {
		const buffer = await toArrayBuffer(data);
		byteLength = await writeViaSyncAccessWorker(path, buffer);
	}

	return { fileRef: path, byteLength };
}

export async function readBinary(path: FileRef): Promise<File> {
	const root = await getOpfsRoot();
	const segments = splitPath(path);
	const fileName = segments.pop();
	if (!fileName) {
		throw createAppError('OPFS_INVALID_PATH', 'Binary path must include a file name.', {
			recoverable: false,
			context: { path }
		});
	}

	const directory = await getDirectoryHandle(root, segments, false);
	const handle = await directory.getFileHandle(fileName);
	return handle.getFile();
}

export async function deletePath(path: FileRef): Promise<void> {
	const root = await getOpfsRoot();
	const segments = splitPath(path);
	const name = segments.pop();
	if (!name) return;

	const directory = await getDirectoryHandle(root, segments, false);
	try {
		await directory.removeEntry(name, { recursive: true });
	} catch (cause) {
		const error = cause as AppError | DOMException;
		if (error instanceof DOMException && error.name === 'NotFoundError') return;
		throw createAppError('OPFS_DELETE_FAILED', 'Failed to delete OPFS path.', {
			cause,
			recoverable: true,
			context: { path }
		});
	}
}

export async function clearAllBinaries(): Promise<void> {
	const root = await getOpfsRoot();
	for await (const [name] of root.entries()) {
		await root.removeEntry(name, { recursive: true });
	}
}

/** Probe whether this origin can actually write an OPFS file (not just open the root). */
export async function probeOpfsWritable(): Promise<boolean> {
	try {
		const probePath = `__samplescout_probe__/${createId()}.bin`;
		const payload = new Uint8Array([1, 2, 3, 4]);
		await writeBinary(probePath, payload);
		await deletePath(probePath);
		try {
			await deletePath('__samplescout_probe__');
		} catch {
			/* directory cleanup best-effort */
		}
		return true;
	} catch {
		return false;
	}
}
