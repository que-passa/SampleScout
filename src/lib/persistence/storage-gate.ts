import { createAppError } from '$lib/domain/ids';
import type { AppError } from '$lib/domain/types';
import { RECORDING_MAX_SECONDS, STORAGE_SAFETY_MARGIN_BYTES } from '$lib/config/recording';

/** Conservative upper bound for Opus/WebM at capture quality (bytes/sec). */
const ESTIMATED_BYTES_PER_SECOND = 24_000;

export interface StorageGateResult {
	ok: boolean;
	availableBytes?: number;
	requiredBytes: number;
	error?: AppError;
}

export function estimateMaxRecordingBytes(
	maxSeconds = RECORDING_MAX_SECONDS,
	bytesPerSecond = ESTIMATED_BYTES_PER_SECOND
): number {
	return Math.ceil(maxSeconds * bytesPerSecond) + STORAGE_SAFETY_MARGIN_BYTES;
}

/** Whether estimated free space covers a full-length Capture (null = estimate unavailable). */
export function storageOkForRequiredBytes(
	availableBytes: number | undefined,
	requiredBytes: number,
	estimateSupported: boolean
): boolean | null {
	if (!estimateSupported || availableBytes === undefined) return null;
	return availableBytes >= requiredBytes;
}

function insufficientMessage(kind: 'recording' | 'import' | 'save'): string {
	switch (kind) {
		case 'recording':
			return 'Not enough free space to save a Local File after Capture. Free space on this device, discard files in Collection, or Import a smaller file.';
		case 'import':
			return 'Not enough free space to import as a Local File. Free space on this device or choose a smaller file.';
		case 'save':
			return 'Not enough free space to save this recording as a Local File. Free space on this device or discard files in Collection.';
	}
}

async function checkStorageForBytes(
	requiredBytes: number,
	kind: 'recording' | 'import' | 'save'
): Promise<StorageGateResult> {
	if (!navigator.storage?.estimate) {
		return {
			ok: true,
			requiredBytes,
			error: createAppError(
				'STORAGE_ESTIMATE_UNAVAILABLE',
				'Storage estimate unavailable — Capture will try to save, but free space is unknown.',
				{ recoverable: true }
			)
		};
	}

	try {
		const estimate = await navigator.storage.estimate();
		const usage = estimate.usage ?? 0;
		const quota = estimate.quota;
		if (quota === undefined) {
			return { ok: true, requiredBytes };
		}

		const availableBytes = Math.max(0, quota - usage);
		if (availableBytes < requiredBytes) {
			return {
				ok: false,
				availableBytes,
				requiredBytes,
				error: createAppError('STORAGE_INSUFFICIENT', insufficientMessage(kind), {
					recoverable: true,
					context: { availableBytes, requiredBytes }
				})
			};
		}

		return { ok: true, availableBytes, requiredBytes };
	} catch (cause) {
		return {
			ok: false,
			requiredBytes,
			error: createAppError(
				'STORAGE_CHECK_FAILED',
				'Could not check free space. Try again, or free space and retry.',
				{
					cause,
					recoverable: true
				}
			)
		};
	}
}

export async function checkStorageForRecording(): Promise<StorageGateResult> {
	return checkStorageForBytes(estimateMaxRecordingBytes(), 'recording');
}

/** Pre-check quota for an import of known size (file bytes + safety margin). */
export async function checkStorageForImport(byteLength: number): Promise<StorageGateResult> {
	const requiredBytes = Math.max(0, byteLength) + STORAGE_SAFETY_MARGIN_BYTES;
	return checkStorageForBytes(requiredBytes, 'import');
}

/** Pre-check quota before committing a recorded blob (actual size + safety margin). */
export async function checkStorageForSave(byteLength: number): Promise<StorageGateResult> {
	const requiredBytes = Math.max(0, byteLength) + STORAGE_SAFETY_MARGIN_BYTES;
	return checkStorageForBytes(requiredBytes, 'save');
}
