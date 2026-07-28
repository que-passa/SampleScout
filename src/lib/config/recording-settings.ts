import type { RecordingSettings } from '$lib/domain/types';

export type {
	RecordingChannelMode,
	RecordingEncoderBitrate,
	RecordingSampleRate,
	RecordingSettings
} from '$lib/domain/types';

export const DEFAULT_RECORDING_SETTINGS: RecordingSettings = {
	channelMode: 'device',
	sampleRate: 'device',
	encoderBitrateKbps: 'device'
};

export function normalizeRecordingSettings(
	input: Partial<RecordingSettings> | undefined
): RecordingSettings {
	return {
		channelMode: input?.channelMode ?? DEFAULT_RECORDING_SETTINGS.channelMode,
		sampleRate: input?.sampleRate ?? DEFAULT_RECORDING_SETTINGS.sampleRate,
		encoderBitrateKbps: input?.encoderBitrateKbps ?? DEFAULT_RECORDING_SETTINGS.encoderBitrateKbps
	};
}

export function recordingConstraints(settings: RecordingSettings): MediaTrackConstraints {
	const audio: MediaTrackConstraints = {
		echoCancellation: false,
		noiseSuppression: false,
		autoGainControl: false
	};

	if (settings.channelMode === 'mono') {
		audio.channelCount = 1;
	} else if (settings.channelMode === 'stereo') {
		audio.channelCount = 2;
	}

	if (settings.sampleRate !== 'device') {
		audio.sampleRate = settings.sampleRate;
	}

	return audio;
}

export function recorderBitrate(settings: RecordingSettings): number | undefined {
	if (settings.encoderBitrateKbps === 'device') return undefined;
	return settings.encoderBitrateKbps * 1000;
}
