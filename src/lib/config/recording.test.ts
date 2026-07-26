import { describe, expect, it } from 'vitest';
import {
	RECORDING_MAX_SECONDS,
	recordingWarningLevel,
	remainingRecordingSeconds
} from './recording';

describe('recording limits', () => {
	it('returns warning levels at the brief thresholds', () => {
		expect(recordingWarningLevel(0)).toBe('none');
		expect(recordingWarningLevel(5 * 60)).toBe('passive');
		expect(recordingWarningLevel(8 * 60)).toBe('remaining');
		expect(recordingWarningLevel(9 * 60)).toBe('strong');
		expect(recordingWarningLevel(RECORDING_MAX_SECONDS)).toBe('limit');
	});

	it('computes remaining time', () => {
		expect(remainingRecordingSeconds(9 * 60)).toBe(60);
		expect(remainingRecordingSeconds(RECORDING_MAX_SECONDS + 10)).toBe(0);
	});
});
