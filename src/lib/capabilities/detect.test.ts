import { describe, expect, it } from 'vitest';
import {
	explainCaptureLimitations,
	explainPersistLimitations,
	explainRecordingLimitations,
	formatBytes,
	type CapabilityReport
} from './detect';

function baseReport(partial: Partial<CapabilityReport> = {}): CapabilityReport {
	return {
		checkedAt: new Date().toISOString(),
		secureContext: true,
		mediaDevices: true,
		getUserMedia: true,
		mediaRecorder: true,
		mediaRecorderMimes: [{ mimeType: 'audio/webm', supported: true }],
		webAudio: true,
		opfs: true,
		indexedDb: true,
		workers: true,
		canvas: true,
		storageEstimate: { supported: true, availableBytes: 500_000_000 },
		storageRequiredForMaxRecording: 169_000_000,
		storageOkForMaxRecording: true,
		persistentStorage: { supported: false },
		errors: [],
		canRecord: true,
		canPersistFiles: true,
		canCaptureSafely: true,
		...partial
	};
}

describe('explainCaptureLimitations', () => {
	it('is empty when Capture can succeed', () => {
		expect(explainCaptureLimitations(baseReport())).toEqual([]);
	});

	it('lists mic and persist gaps separately', () => {
		const report = baseReport({
			secureContext: false,
			getUserMedia: false,
			canRecord: false,
			opfs: false,
			canPersistFiles: false,
			storageOkForMaxRecording: false,
			canCaptureSafely: false
		});
		const recording = explainRecordingLimitations(report);
		const persist = explainPersistLimitations(report);
		const all = explainCaptureLimitations(report);
		expect(recording.some((r) => r.includes('secure context'))).toBe(true);
		expect(recording.some((r) => r.includes('Microphone'))).toBe(true);
		expect(persist.some((r) => r.includes('OPFS'))).toBe(true);
		expect(all.some((r) => r.includes('free space'))).toBe(true);
	});
});

describe('formatBytes', () => {
	it('formats common sizes', () => {
		expect(formatBytes(undefined)).toBe('—');
		expect(formatBytes(512)).toBe('512 B');
		expect(formatBytes(2048)).toBe('2.0 KB');
	});
});
