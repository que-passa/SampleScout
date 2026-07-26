import { encodeAndPersistTakeOutput } from '$lib/audio/encode';
import { uploadSample } from '$lib/audiotool';
import { createAppError, nowIso } from '$lib/domain/ids';
import type { AppError, OutputSettings, Take, TakeId, UploadJob } from '$lib/domain/types';
import {
	isActiveUploadJobState,
	jobPhaseForOutput,
	takeUploadStateFromJob,
	validateTakeForUpload
} from '$lib/domain/upload';
import {
	createUploadJob,
	getTake,
	getUploadJob,
	getUploadJobForTake,
	listInFlightUploadJobs,
	listQueuedUploadJobs,
	patchUploadJob,
	updateTake
} from '$lib/persistence';
import { readBinary } from '$lib/persistence/opfs';
import { notifyTakeInventoryChanged } from './take-actions';
import { acquirePreventUnload } from './prevent-unload';

type JobListener = () => void | Promise<void>;
// Module-level registries — not component reactive state.
// eslint-disable-next-line svelte/prefer-svelte-reactivity -- listener fan-out
const listeners = new Set<JobListener>();

/** Reactive snapshot of the in-session upload queue (persisted jobs + live progress). */
export const uploadQueue = $state({
	hydrated: false,
	busy: false,
	activeJobId: null as string | null,
	/** Latest job per take (for UI). */
	byTakeId: {} as Record<string, UploadJob>,
	error: null as string | null
});

let processing = false;
// eslint-disable-next-line svelte/prefer-svelte-reactivity -- in-flight abort controllers
const abortByJobId = new Map<string, AbortController>();

export function onUploadQueueChanged(listener: JobListener): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

async function emitChange(): Promise<void> {
	for (const listener of listeners) {
		await listener();
	}
	await notifyTakeInventoryChanged();
}

function rememberJob(job: UploadJob): void {
	uploadQueue.byTakeId = {
		...uploadQueue.byTakeId,
		[job.takeId]: job
	};
	if (isActiveUploadJobState(job.state)) {
		uploadQueue.activeJobId = job.id;
	} else if (uploadQueue.activeJobId === job.id) {
		uploadQueue.activeJobId = null;
	}
}

function asAppError(cause: unknown, fallback: string): AppError {
	if (cause && typeof cause === 'object' && 'code' in cause && 'message' in cause) {
		return cause as AppError;
	}
	const message =
		cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : fallback;
	return createAppError('UPLOAD_FAILED', message, { cause, recoverable: true });
}

function isCanceledError(error: AppError): boolean {
	return error.code === 'UPLOAD_CANCELED' || error.message.toLowerCase().includes('abort');
}

async function syncTakeUploadState(takeId: TakeId, job: UploadJob): Promise<Take | undefined> {
	const take = await getTake(takeId);
	if (!take) return undefined;

	const uploadState = takeUploadStateFromJob(job.state);
	if (take.uploadState === uploadState && job.state !== 'failed') {
		return take;
	}

	return updateTake({
		...take,
		uploadState,
		lastError: job.state === 'failed' ? job.error : undefined
	});
}

function uploadOutputForTake(take: Take): Extract<OutputSettings, { format: 'wav' | 'mp3' }> {
	if (take.output.format === 'wav' || take.output.format === 'mp3') {
		return take.output;
	}
	return { format: 'wav', bitDepth: 16 };
}

/**
 * Mark abandoned in-flight jobs as failed after a page reload.
 * Uploads do not continue after the tab is closed.
 */
export async function hydrateUploadQueue(): Promise<void> {
	const inFlight = await listInFlightUploadJobs();
	const abandonedMessage =
		'Upload stopped when this page closed. Local draft is intact — Retry to upload again.';

	for (const job of inFlight) {
		const failed = await patchUploadJob(job.id, {
			state: 'failed',
			progress: undefined,
			error: createAppError('UPLOAD_ABANDONED', abandonedMessage, {
				recoverable: true,
				context: { takeId: job.takeId, jobId: job.id }
			})
		});
		rememberJob(failed);
		await syncTakeUploadState(job.takeId, failed);
	}

	const queued = await listQueuedUploadJobs();
	for (const job of queued) {
		rememberJob(job);
	}

	uploadQueue.hydrated = true;
	await emitChange();
	void processUploadQueue();
}

export function getUploadJobSnapshot(takeId: TakeId): UploadJob | undefined {
	return uploadQueue.byTakeId[takeId];
}

/** Enqueue a take for encode + Audiotool upload. Returns the job. */
export async function enqueueTakeUpload(takeId: TakeId): Promise<UploadJob> {
	const take = await getTake(takeId);
	if (!take) {
		throw createAppError('TAKE_NOT_FOUND', 'Take was not found.', {
			recoverable: true,
			context: { takeId }
		});
	}

	const validation = validateTakeForUpload(take);
	if (validation) throw validation;

	const existing = await getUploadJobForTake(takeId);
	if (existing && isActiveUploadJobState(existing.state)) {
		rememberJob(existing);
		return existing;
	}

	const job = await createUploadJob(takeId);
	rememberJob(job);
	await syncTakeUploadState(takeId, job);
	await emitChange();
	void processUploadQueue();
	return job;
}

/** Retry a failed upload from the earliest required step. */
export async function retryTakeUpload(takeId: TakeId): Promise<UploadJob> {
	const take = await getTake(takeId);
	if (!take) {
		throw createAppError('TAKE_NOT_FOUND', 'Take was not found.', {
			recoverable: true,
			context: { takeId }
		});
	}

	const validation = validateTakeForUpload(take);
	if (validation) throw validation;

	const previous = await getUploadJobForTake(takeId);
	if (previous && isActiveUploadJobState(previous.state)) {
		return previous;
	}

	const attempt = (previous?.attempt ?? 0) + 1;
	const job = await createUploadJob(takeId);
	const stamped = await patchUploadJob(job.id, { attempt });
	rememberJob(stamped);
	await syncTakeUploadState(takeId, stamped);
	await emitChange();
	void processUploadQueue();
	return stamped;
}

/** Cancel the active upload for a take (SDK AbortSignal where supported). */
export async function cancelTakeUpload(takeId: TakeId): Promise<void> {
	const job = uploadQueue.byTakeId[takeId] ?? (await getUploadJobForTake(takeId));
	if (!job || !isActiveUploadJobState(job.state)) return;

	abortByJobId.get(job.id)?.abort();
	abortByJobId.delete(job.id);

	const canceled = await patchUploadJob(job.id, {
		state: 'canceled',
		progress: undefined,
		error: createAppError('UPLOAD_CANCELED', 'Upload canceled.', { recoverable: true })
	});
	rememberJob(canceled);
	await syncTakeUploadState(takeId, canceled);
	await emitChange();
}

async function processUploadQueue(): Promise<void> {
	if (processing) return;
	processing = true;
	uploadQueue.busy = true;

	try {
		while (true) {
			const queued = await listQueuedUploadJobs();
			const next = queued[0];
			if (!next) break;
			await runUploadJob(next.id);
		}
	} finally {
		processing = false;
		uploadQueue.busy = false;
		if (!uploadQueue.activeJobId) {
			/* leave cleared by rememberJob */
		}
	}
}

async function runUploadJob(jobId: string): Promise<void> {
	let job = await getUploadJob(jobId);
	if (!job || job.state !== 'queued') return;

	const controller = new AbortController();
	abortByJobId.set(jobId, controller);
	const releaseUnload = acquirePreventUnload();

	try {
		let take = await getTake(job.takeId);
		if (!take) {
			throw createAppError('TAKE_NOT_FOUND', 'Take was not found for upload.', {
				recoverable: false,
				context: { takeId: job.takeId }
			});
		}

		const validation = validateTakeForUpload(take);
		if (validation) throw validation;

		const output = uploadOutputForTake(take);
		const needsEncode = !take.renderedAsset || take.output.format === 'source';

		if (needsEncode) {
			const phase = jobPhaseForOutput(output.format);
			job = await patchUploadJob(jobId, {
				state: phase,
				progress: { phase, fraction: 0 },
				error: undefined
			});
			rememberJob(job);
			await syncTakeUploadState(job.takeId, job);
			await emitChange();

			const encoded = await encodeAndPersistTakeOutput(take, {
				output,
				signal: controller.signal,
				onProgress: (fraction) => {
					void patchUploadJob(jobId, {
						progress: { phase, fraction }
					}).then((updated) => {
						rememberJob(updated);
					});
				}
			});
			take = encoded.take;

			job = await patchUploadJob(jobId, {
				renderedFileRef: take.renderedAsset?.fileRef,
				renderedByteLength: take.renderedAsset?.byteLength,
				progress: { phase, fraction: 1 }
			});
			rememberJob(job);
		} else {
			job = await patchUploadJob(jobId, {
				renderedFileRef: take.renderedAsset?.fileRef,
				renderedByteLength: take.renderedAsset?.byteLength
			});
			rememberJob(job);
		}

		if (controller.signal.aborted) {
			throw createAppError('UPLOAD_CANCELED', 'Upload canceled.', { recoverable: true });
		}

		const fileRef = take.renderedAsset?.fileRef;
		if (!fileRef) {
			throw createAppError('UPLOAD_NO_RENDER', 'No rendered export is available to upload.', {
				recoverable: true,
				context: { takeId: take.id }
			});
		}

		const file = await readBinary(fileRef);

		const takeIdForUpload = job.takeId;

		job = await patchUploadJob(jobId, {
			state: 'uploading',
			progress: { phase: 'uploading' },
			error: undefined
		});
		rememberJob(job);
		await syncTakeUploadState(takeIdForUpload, job);
		await emitChange();

		const result = await uploadSample({
			file,
			metadata: take.metadata,
			signal: controller.signal,
			onBytesUploaded: async () => {
				const processingJob = await patchUploadJob(jobId, {
					state: 'processing',
					progress: { phase: 'processing' },
					uploadedAt: nowIso()
				});
				rememberJob(processingJob);
				await syncTakeUploadState(takeIdForUpload, processingJob);
				await emitChange();
			}
		});

		job = await patchUploadJob(jobId, {
			state: 'completed',
			progress: undefined,
			readyAt: nowIso(),
			audiotoolSampleName: result.sampleName,
			error: undefined
		});
		rememberJob(job);
		await syncTakeUploadState(takeIdForUpload, job);
		await emitChange();
	} catch (cause) {
		const current = await getUploadJob(jobId);
		if (current?.state === 'canceled') {
			rememberJob(current);
			await syncTakeUploadState(current.takeId, current);
			await emitChange();
			return;
		}

		const error = asAppError(cause, 'Upload failed.');
		if (isCanceledError(error) || controller.signal.aborted) {
			const canceled = await patchUploadJob(jobId, {
				state: 'canceled',
				progress: undefined,
				error: createAppError('UPLOAD_CANCELED', 'Upload canceled.', {
					cause,
					recoverable: true
				})
			});
			rememberJob(canceled);
			await syncTakeUploadState(canceled.takeId, canceled);
			await emitChange();
			return;
		}

		const failed = await patchUploadJob(jobId, {
			state: 'failed',
			progress: undefined,
			error
		});
		rememberJob(failed);
		await syncTakeUploadState(failed.takeId, failed);
		uploadQueue.error = error.message;
		await emitChange();
	} finally {
		abortByJobId.delete(jobId);
		releaseUnload();
	}
}
