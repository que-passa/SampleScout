/** SHA-256 hex digest of binary bytes (for rendered asset identity / OPFS path). */
export async function hashBytes(data: ArrayBuffer | Uint8Array): Promise<string> {
	const buffer =
		data instanceof ArrayBuffer
			? data
			: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
	const digest = await crypto.subtle.digest('SHA-256', buffer as ArrayBuffer);
	return bufferToHex(digest);
}

/** Short stable path segment from a full content hash. */
export function shortHash(hash: string, length = 16): string {
	return hash.slice(0, length);
}

function bufferToHex(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let hex = '';
	for (let i = 0; i < bytes.length; i += 1) {
		hex += (bytes[i] ?? 0).toString(16).padStart(2, '0');
	}
	return hex;
}
