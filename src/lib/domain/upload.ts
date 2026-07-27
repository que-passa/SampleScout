import { createAppError } from './ids';
import type {
	AppError,
	Take,
	TakeMetadata,
	TakeUploadState,
	UploadJob,
	UploadJobState
} from './types';

export type UploadPhase = NonNullable<UploadJob['progress']>['phase'];

const ACTIVE_JOB_STATES: readonly UploadJobState[] = [
	'queued',
	'rendering',
	'encoding',
	'uploading',
	'processing'
];

/** Jobs that were mid-flight when the page closed (not merely waiting in queue). */
const IN_FLIGHT_JOB_STATES: readonly UploadJobState[] = [
	'rendering',
	'encoding',
	'uploading',
	'processing'
];

const ACTIVE_TAKE_UPLOAD_STATES: readonly TakeUploadState[] = [
	'queued',
	'rendering',
	'encoding',
	'uploading',
	'processing'
];

/** Metadata must be valid before enqueueing an Audiotool upload. */
export function validateTakeMetadataForUpload(
	metadata: Pick<TakeMetadata, 'displayName' | 'kind' | 'bpm'>
): AppError | null {
	const displayName = metadata.displayName.trim();
	if (!displayName) {
		return createAppError('UPLOAD_METADATA_INVALID', 'Display name is required before upload.', {
			recoverable: true
		});
	}

	if (metadata.kind === 'loop') {
		const bpm = metadata.bpm;
		if (bpm == null || !Number.isFinite(bpm) || bpm <= 0) {
			return createAppError(
				'UPLOAD_METADATA_INVALID',
				'Loop samples need a BPM greater than 0 before upload.',
				{ recoverable: true }
			);
		}
	}

	return null;
}

export function validateTakeForUpload(take: Take): AppError | null {
	if (take.lifecycleState !== 'saved' || !take.source.fileRef) {
		return createAppError('UPLOAD_NOT_SAVED', 'Save the take locally before uploading.', {
			recoverable: true,
			context: { takeId: take.id }
		});
	}

	return validateTakeMetadataForUpload(take.metadata);
}

export function isActiveUploadJobState(state: UploadJobState): boolean {
	return ACTIVE_JOB_STATES.includes(state);
}

export function isInFlightUploadJobState(state: UploadJobState): boolean {
	return IN_FLIGHT_JOB_STATES.includes(state);
}

export function isActiveTakeUploadState(state: TakeUploadState): boolean {
	return ACTIVE_TAKE_UPLOAD_STATES.includes(state);
}

/** Map job state → take.uploadState (completed → uploaded). */
export function takeUploadStateFromJob(state: UploadJobState): TakeUploadState {
	switch (state) {
		case 'completed':
			return 'uploaded';
		case 'canceled':
			return 'not-queued';
		case 'failed':
			return 'failed';
		case 'queued':
		case 'rendering':
		case 'encoding':
		case 'uploading':
		case 'processing':
			return state;
	}
}

export function formatUploadStateLabel(state: TakeUploadState | UploadJobState): string {
	switch (state) {
		case 'not-queued':
			return 'Local draft';
		case 'queued':
			return 'Queued';
		case 'rendering':
			return 'Rendering';
		case 'encoding':
			return 'Encoding';
		case 'uploading':
			return 'Uploading';
		case 'processing':
			return 'Processing on Audiotool';
		case 'uploaded':
		case 'completed':
			return 'Uploaded';
		case 'failed':
			return 'Upload failed';
		case 'canceled':
			return 'Canceled';
	}
}

export function uploadStateTone(
	state: TakeUploadState | UploadJobState
): 'neutral' | 'ok' | 'signal' | 'muted' {
	switch (state) {
		case 'uploaded':
		case 'completed':
			return 'ok';
		case 'failed':
			return 'signal';
		case 'not-queued':
		case 'canceled':
			return 'muted';
		default:
			return 'neutral';
	}
}

export function jobPhaseForOutput(
	format: Take['output']['format']
): Extract<UploadPhase, 'rendering' | 'encoding'> {
	return format === 'mp3' ? 'encoding' : 'rendering';
}
