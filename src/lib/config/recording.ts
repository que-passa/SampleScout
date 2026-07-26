/** Recording length policy (seconds). */
export const RECORDING_MAX_SECONDS = 10 * 60;

/**
 * Live capture waveform: one analyser peak bucket (and UI tick) per this many ms.
 * LiveWaveform draws 1 CSS px per bucket → visible window ≈ width_px × this / 1000 s.
 */
export const LIVE_PEAK_INTERVAL_MS = 10;
export const RECORDING_PASSIVE_WARNING_SECONDS = 5 * 60;
export const RECORDING_REMAINING_WARNING_SECONDS = 8 * 60;
export const RECORDING_STRONG_WARNING_SECONDS = 9 * 60;

export type RecordingWarningLevel = 'none' | 'passive' | 'remaining' | 'strong' | 'limit';

export function recordingWarningLevel(elapsedSeconds: number): RecordingWarningLevel {
	if (elapsedSeconds >= RECORDING_MAX_SECONDS) return 'limit';
	if (elapsedSeconds >= RECORDING_STRONG_WARNING_SECONDS) return 'strong';
	if (elapsedSeconds >= RECORDING_REMAINING_WARNING_SECONDS) return 'remaining';
	if (elapsedSeconds >= RECORDING_PASSIVE_WARNING_SECONDS) return 'passive';
	return 'none';
}

export function remainingRecordingSeconds(elapsedSeconds: number): number {
	return Math.max(0, RECORDING_MAX_SECONDS - elapsedSeconds);
}

export const APP_NAME = 'SampleScout';
export const APP_VERSION = '0.0.1';

/** Safety margin when estimating storage before capture (bytes). */
export const STORAGE_SAFETY_MARGIN_BYTES = 25 * 1024 * 1024;

/** Ephemeral action feedback toast. */
export const ACTION_TOAST_MS = 2_800;
