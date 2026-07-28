import { describe, expect, it } from 'vitest';
import {
	DEFAULT_RECORDING_SETTINGS,
	normalizeRecordingSettings,
	recorderBitrate,
	recordingConstraints
} from './recording-settings';

describe('recording settings', () => {
	it('fills missing fields with defaults', () => {
		expect(normalizeRecordingSettings({ channelMode: 'mono' })).toEqual({
			...DEFAULT_RECORDING_SETTINGS,
			channelMode: 'mono'
		});
	});

	it('maps mono/stereo and sample rate into getUserMedia constraints', () => {
		expect(
			recordingConstraints({
				channelMode: 'mono',
				sampleRate: 48000,
				encoderBitrateKbps: 'device'
			})
		).toEqual({
			echoCancellation: false,
			noiseSuppression: false,
			autoGainControl: false,
			channelCount: 1,
			sampleRate: 48000
		});
	});

	it('omits device-default fields from constraints', () => {
		expect(recordingConstraints(DEFAULT_RECORDING_SETTINGS)).toEqual({
			echoCancellation: false,
			noiseSuppression: false,
			autoGainControl: false
		});
	});

	it('maps encoder bitrate to MediaRecorder bits per second', () => {
		expect(
			recorderBitrate({
				channelMode: 'device',
				sampleRate: 'device',
				encoderBitrateKbps: 128
			})
		).toBe(128_000);
		expect(recorderBitrate(DEFAULT_RECORDING_SETTINGS)).toBeUndefined();
	});
});
