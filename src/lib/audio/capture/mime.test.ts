import { describe, expect, it } from 'vitest';
import { recordingWarningLevel } from '$lib/config/recording';
import { estimateMaxRecordingBytes } from '$lib/persistence/storage-gate';
import { pickSupportedRecorderMime, extensionForMime } from '$lib/audio/capture/mime';
import { STORAGE_SAFETY_MARGIN_BYTES } from '$lib/config/recording';

describe('estimateMaxRecordingBytes', () => {
	it('includes the storage safety margin', () => {
		const bytes = estimateMaxRecordingBytes(60, 1000);
		expect(bytes).toBe(60_000 + STORAGE_SAFETY_MARGIN_BYTES);
	});
});

describe('recordingWarningLevel', () => {
	it('escalates through passive remaining strong limit', () => {
		expect(recordingWarningLevel(0)).toBe('none');
		expect(recordingWarningLevel(5 * 60)).toBe('passive');
		expect(recordingWarningLevel(8 * 60)).toBe('remaining');
		expect(recordingWarningLevel(9 * 60)).toBe('strong');
		expect(recordingWarningLevel(10 * 60)).toBe('limit');
	});
});

describe('capture mime helpers', () => {
	it('returns undefined when MediaRecorder is missing', () => {
		const original = globalThis.MediaRecorder;
		// @ts-expect-error test override
		delete globalThis.MediaRecorder;
		expect(pickSupportedRecorderMime()).toBeUndefined();
		globalThis.MediaRecorder = original;
	});

	it('maps mime types to extensions', () => {
		expect(extensionForMime('audio/webm;codecs=opus')).toBe('webm');
		expect(extensionForMime('audio/mp4')).toBe('m4a');
		expect(extensionForMime('audio/ogg')).toBe('ogg');
	});
});
