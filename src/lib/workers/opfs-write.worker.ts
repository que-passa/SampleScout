/// <reference lib="webworker" />

import type {
	OpfsWriteWorkerRequest,
	OpfsWriteWorkerResponse
} from '../persistence/opfs-write-protocol';

const worker = self as DedicatedWorkerGlobalScope;

async function resolveFileHandle(
	root: FileSystemDirectoryHandle,
	path: string
): Promise<FileSystemFileHandle> {
	const segments = path.split('/').filter(Boolean);
	const fileName = segments.pop();
	if (!fileName) throw new Error('Binary path must include a file name.');

	let directory = root;
	for (const segment of segments) {
		directory = await directory.getDirectoryHandle(segment, { create: true });
	}
	return directory.getFileHandle(fileName, { create: true });
}

worker.onmessage = (event: MessageEvent<OpfsWriteWorkerRequest>) => {
	const message = event.data;
	if (!message || message.type !== 'write') return;

	void (async () => {
		try {
			if (!navigator.storage?.getDirectory) {
				throw new Error('Origin Private File System is unavailable.');
			}
			const root = await navigator.storage.getDirectory();
			const handle = await resolveFileHandle(root, message.path);
			if (typeof handle.createSyncAccessHandle !== 'function') {
				throw new Error('OPFS sync access handles are unavailable in this worker.');
			}

			const access = await handle.createSyncAccessHandle();
			try {
				const bytes = new Uint8Array(message.data);
				access.write(bytes, { at: 0 });
				access.truncate(bytes.byteLength);
				access.flush();
			} finally {
				access.close();
			}

			const file = await handle.getFile();
			const response: OpfsWriteWorkerResponse = {
				type: 'result',
				id: message.id,
				byteLength: file.size
			};
			worker.postMessage(response);
		} catch (cause) {
			const response: OpfsWriteWorkerResponse = {
				type: 'error',
				id: message.id,
				message: cause instanceof Error ? cause.message : 'OPFS worker write failed.'
			};
			worker.postMessage(response);
		}
	})();
};
