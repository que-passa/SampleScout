import { createAppError } from '$lib/domain/ids';
import type { AppError } from '$lib/domain/types';

export interface MimeSupport {
	mimeType: string;
	supported: boolean;
}

export interface StorageEstimateReport {
	supported: boolean;
	usageBytes?: number;
	quotaBytes?: number;
	availableBytes?: number;
}

export interface CapabilityReport {
	checkedAt: string;
	secureContext: boolean;
	mediaDevices: boolean;
	getUserMedia: boolean;
	mediaRecorder: boolean;
	mediaRecorderMimes: MimeSupport[];
	webAudio: boolean;
	opfs: boolean;
	indexedDb: boolean;
	workers: boolean;
	canvas: boolean;
	storageEstimate: StorageEstimateReport;
	persistentStorage: {
		supported: boolean;
		persisted?: boolean;
	};
	errors: AppError[];
	canRecord: boolean;
	canPersistFiles: boolean;
}

const MIME_CANDIDATES = [
	'audio/webm;codecs=opus',
	'audio/webm',
	'audio/mp4',
	'audio/ogg;codecs=opus',
	'audio/ogg'
];

function probeMediaRecorderMimes(): MimeSupport[] {
	if (typeof MediaRecorder === 'undefined') {
		return MIME_CANDIDATES.map((mimeType) => ({ mimeType, supported: false }));
	}

	return MIME_CANDIDATES.map((mimeType) => ({
		mimeType,
		supported: MediaRecorder.isTypeSupported(mimeType)
	}));
}

async function probeOpfs(): Promise<boolean> {
	try {
		if (!navigator.storage?.getDirectory) return false;
		const { probeOpfsWritable } = await import('$lib/persistence/opfs');
		return await probeOpfsWritable();
	} catch {
		return false;
	}
}

async function probeIndexedDb(): Promise<boolean> {
	try {
		if (typeof indexedDB === 'undefined') return false;
		return await new Promise<boolean>((resolve) => {
			const request = indexedDB.open('samplescout-capability-probe');
			request.onerror = () => resolve(false);
			request.onsuccess = () => {
				request.result.close();
				indexedDB.deleteDatabase('samplescout-capability-probe');
				resolve(true);
			};
		});
	} catch {
		return false;
	}
}

async function probeStorageEstimate(): Promise<StorageEstimateReport> {
	if (!navigator.storage?.estimate) {
		return { supported: false };
	}

	try {
		const estimate = await navigator.storage.estimate();
		const usageBytes = estimate.usage;
		const quotaBytes = estimate.quota;
		return {
			supported: true,
			usageBytes,
			quotaBytes,
			availableBytes:
				usageBytes !== undefined && quotaBytes !== undefined
					? Math.max(0, quotaBytes - usageBytes)
					: undefined
		};
	} catch {
		return { supported: false };
	}
}

async function probePersistentStorage(): Promise<CapabilityReport['persistentStorage']> {
	if (!navigator.storage?.persisted) {
		return { supported: false };
	}

	try {
		const persisted = await navigator.storage.persisted();
		return { supported: true, persisted };
	} catch {
		return { supported: false };
	}
}

export async function detectCapabilities(): Promise<CapabilityReport> {
	const errors: AppError[] = [];
	const secureContext = typeof window !== 'undefined' ? window.isSecureContext : false;
	const mediaDevices = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices);
	const getUserMedia = Boolean(navigator.mediaDevices?.getUserMedia);
	const mediaRecorder = typeof MediaRecorder !== 'undefined';
	const mediaRecorderMimes = probeMediaRecorderMimes();
	const webAudio =
		typeof window !== 'undefined' &&
		(typeof window.AudioContext !== 'undefined' ||
			typeof (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext !==
				'undefined');
	const workers = typeof Worker !== 'undefined';
	const canvas =
		typeof document !== 'undefined' && Boolean(document.createElement('canvas').getContext);

	let opfs = false;
	let indexedDb = false;

	try {
		opfs = await probeOpfs();
	} catch (cause) {
		errors.push(
			createAppError('OPFS_PROBE_FAILED', 'Could not probe Origin Private File System.', {
				cause,
				recoverable: true
			})
		);
	}

	try {
		indexedDb = await probeIndexedDb();
	} catch (cause) {
		errors.push(
			createAppError('IDB_PROBE_FAILED', 'Could not probe IndexedDB.', {
				cause,
				recoverable: true
			})
		);
	}

	const storageEstimate = await probeStorageEstimate();
	const persistentStorage = await probePersistentStorage();

	const canRecord =
		secureContext &&
		getUserMedia &&
		mediaRecorder &&
		mediaRecorderMimes.some((entry) => entry.supported);

	const canPersistFiles = opfs && indexedDb;

	return {
		checkedAt: new Date().toISOString(),
		secureContext,
		mediaDevices,
		getUserMedia,
		mediaRecorder,
		mediaRecorderMimes,
		webAudio,
		opfs,
		indexedDb,
		workers,
		canvas,
		storageEstimate,
		persistentStorage,
		errors,
		canRecord,
		canPersistFiles
	};
}

export function formatBytes(bytes: number | undefined): string {
	if (bytes === undefined) return '—';
	if (bytes < 1024) return `${bytes} B`;
	const units = ['KB', 'MB', 'GB', 'TB'];
	let value = bytes / 1024;
	let unitIndex = 0;
	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}
	return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}
