import { describe, expect, it } from 'vitest';
import type { Take, TakeMetadata } from './types';
import {
	formatUploadStateLabel,
	isActiveUploadJobState,
	isInFlightUploadJobState,
	jobPhaseForOutput,
	takeUploadStateFromJob,
	uploadStateTone,
	validateTakeForUpload,
	validateTakeMetadataForUpload
} from './upload';

function metadata(partial: Partial<TakeMetadata> = {}): TakeMetadata {
	return {
		displayName: 'Field Session · test — 001',
		description: '',
		tags: ['recording'],
		kind: 'one-shot',
		visibility: 'unlisted',
		provenance: {
			displayName: 'generated',
			description: 'application-default',
			tags: 'application-default',
			kind: 'application-default',
			visibility: 'application-default'
		},
		...partial
	};
}

describe('validateTakeMetadataForUpload', () => {
	it('requires a non-empty display name', () => {
		const error = validateTakeMetadataForUpload(metadata({ displayName: '   ' }));
		expect(error?.code).toBe('UPLOAD_METADATA_INVALID');
	});

	it('requires BPM for loops', () => {
		const error = validateTakeMetadataForUpload(metadata({ kind: 'loop' }));
		expect(error?.code).toBe('UPLOAD_METADATA_INVALID');
		expect(error?.message).toMatch(/BPM/i);
	});

	it('accepts a loop with BPM', () => {
		expect(validateTakeMetadataForUpload(metadata({ kind: 'loop', bpm: 120 }))).toBeNull();
	});

	it('accepts a one-shot without BPM', () => {
		expect(validateTakeMetadataForUpload(metadata())).toBeNull();
	});
});

describe('validateTakeForUpload', () => {
	it('rejects unsaved takes', () => {
		const take = {
			id: 't1',
			lifecycleState: 'finalizing',
			source: { fileRef: 'x' },
			metadata: metadata()
		} as Take;
		expect(validateTakeForUpload(take)?.code).toBe('UPLOAD_NOT_SAVED');
	});
});

describe('takeUploadStateFromJob', () => {
	it('maps completed to uploaded and canceled to not-queued', () => {
		expect(takeUploadStateFromJob('completed')).toBe('uploaded');
		expect(takeUploadStateFromJob('canceled')).toBe('not-queued');
		expect(takeUploadStateFromJob('uploading')).toBe('uploading');
	});
});

describe('formatUploadStateLabel', () => {
	it('uses honest phase labels', () => {
		expect(formatUploadStateLabel('uploading')).toBe('Uploading');
		expect(formatUploadStateLabel('processing')).toBe('Processing');
		expect(formatUploadStateLabel('uploaded')).toBe('Uploaded');
		expect(formatUploadStateLabel('failed')).toBe('Upload failed');
	});
});

describe('upload helpers', () => {
	it('detects active and in-flight job states', () => {
		expect(isActiveUploadJobState('queued')).toBe(true);
		expect(isActiveUploadJobState('completed')).toBe(false);
		expect(isInFlightUploadJobState('queued')).toBe(false);
		expect(isInFlightUploadJobState('uploading')).toBe(true);
	});

	it('picks encoding phase for MP3', () => {
		expect(jobPhaseForOutput('mp3')).toBe('encoding');
		expect(jobPhaseForOutput('wav')).toBe('rendering');
	});

	it('tones failed uploads as signal', () => {
		expect(uploadStateTone('failed')).toBe('signal');
		expect(uploadStateTone('uploaded')).toBe('ok');
	});
});
