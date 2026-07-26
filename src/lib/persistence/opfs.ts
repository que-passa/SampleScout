import { createAppError } from '$lib/domain/ids';
import type { AppError, FileRef } from '$lib/domain/types';

export interface OpfsWriteResult {
	fileRef: FileRef;
	byteLength: number;
}

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
	const writable = await handle.createWritable();
	const chunk =
		data instanceof Blob ? data : data instanceof ArrayBuffer ? data : Uint8Array.from(data);

	try {
		await writable.write(chunk);
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
	return { fileRef: path, byteLength: file.size };
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
