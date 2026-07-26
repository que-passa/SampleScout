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

async function checkStorageForBytes(
	requiredBytes: number,
	messages: {
		unavailable: string;
		insufficient: string;
		failed: string;
	}
): Promise<StorageGateResult> {
	if (!navigator.storage?.estimate) {
		return {
			ok: true,
			requiredBytes,
			error: createAppError('STORAGE_ESTIMATE_UNAVAILABLE', messages.unavailable, {
				recoverable: true
			})
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
				error: createAppError('STORAGE_INSUFFICIENT', messages.insufficient, {
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
			error: createAppError('STORAGE_CHECK_FAILED', messages.failed, {
				cause,
				recoverable: true
			})
		};
	}
}

export async function checkStorageForRecording(): Promise<StorageGateResult> {
	return checkStorageForBytes(estimateMaxRecordingBytes(), {
		unavailable:
			'Storage estimate is unavailable; recording will proceed without a quota pre-check.',
		insufficient:
			'Not enough local storage for a full-length capture. Free space or delete Local Drafts from Collection, then try again.',
		failed: 'Could not verify local storage before recording.'
	});
}

/** Pre-check quota for an import of known size (file bytes + safety margin). */
export async function checkStorageForImport(byteLength: number): Promise<StorageGateResult> {
	const requiredBytes = Math.max(0, byteLength) + STORAGE_SAFETY_MARGIN_BYTES;
	return checkStorageForBytes(requiredBytes, {
		unavailable:
			'Storage estimate is unavailable; import will proceed without a quota pre-check.',
		insufficient:
			'Not enough local storage for this import. Free space or delete Local Drafts from Collection, then try again.',
		failed: 'Could not verify local storage before import.'
	});
}
