import { nowIso } from '$lib/domain/ids';
import type { AppSettings, OutputSettings } from '$lib/domain/types';
import { cloneForIdb } from './clone-for-idb';
import { getDatabase } from './db';

const SETTINGS_ID = 'settings' as const;

const DEFAULT_OUTPUT: OutputSettings = {
	format: 'wav',
	bitDepth: 16
};

function defaultSettings(): AppSettings {
	return {
		id: SETTINGS_ID,
		recentTags: [],
		preferredOutput: DEFAULT_OUTPUT,
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
		preferredOutput: row.preferredOutput ?? DEFAULT_OUTPUT,
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
