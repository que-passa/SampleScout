import {
	DEFAULT_RECORDING_SETTINGS,
	normalizeRecordingSettings
} from '$lib/config/recording-settings';
import { DEFAULT_UPLOAD_OUTPUT } from '$lib/config/upload-output';
import { nowIso } from '$lib/domain/ids';
import type { AppSettings, OutputSettings, RecordingSettings } from '$lib/domain/types';
import { cloneForIdb } from './clone-for-idb';
import { getDatabase } from './db';

const SETTINGS_ID = 'settings' as const;

function defaultSettings(): AppSettings {
	return {
		id: SETTINGS_ID,
		recentTags: [],
		preferredOutput: DEFAULT_UPLOAD_OUTPUT,
		recordingSettings: { ...DEFAULT_RECORDING_SETTINGS },
		sessionNamePresets: [],
		updatedAt: nowIso()
	};
}

/** Read app settings; fills missing fields for older rows. */
export async function getAppSettings(): Promise<AppSettings> {
	const row = await getDatabase().settings.get(SETTINGS_ID);
	if (!row) return defaultSettings();

	return {
		id: SETTINGS_ID,
		recentTags: Array.isArray(row.recentTags) ? [...row.recentTags] : [],
		preferredOutput: row.preferredOutput ?? DEFAULT_UPLOAD_OUTPUT,
		recordingSettings: normalizeRecordingSettings(row.recordingSettings),
		sessionNamePresets: Array.isArray(row.sessionNamePresets) ? [...row.sessionNamePresets] : [],
		updatedAt: row.updatedAt ?? nowIso()
	};
}

export async function putAppSettings(settings: AppSettings): Promise<void> {
	await getDatabase().settings.put(
		cloneForIdb({
			...settings,
			id: SETTINGS_ID,
			updatedAt: nowIso()
		})
	);
}

/** Persist capture recording requests and upload encode defaults. */
export async function putCapturePreferences(input: {
	recordingSettings: RecordingSettings;
	preferredOutput: Extract<OutputSettings, { format: 'wav' | 'mp3' }>;
}): Promise<AppSettings> {
	const current = await getAppSettings();
	const next: AppSettings = {
		...current,
		recordingSettings: normalizeRecordingSettings(input.recordingSettings),
		preferredOutput: input.preferredOutput,
		updatedAt: nowIso()
	};
	await putAppSettings(next);
	return next;
}

/** Replace remembered custom session titles (newest first). */
export async function putSessionNamePresets(presets: string[]): Promise<AppSettings> {
	const current = await getAppSettings();
	const next: AppSettings = {
		...current,
		sessionNamePresets: [...presets],
		updatedAt: nowIso()
	};
	await putAppSettings(next);
	return next;
}
