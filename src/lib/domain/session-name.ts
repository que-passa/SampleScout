/** Default Field Session title — datetime lives in Collection metadata, not the name. */
export const DEFAULT_SESSION_NAME = 'Session';

/** Max custom titles remembered on this device for the Capture name sheet. */
export const SESSION_NAME_PRESET_LIMIT = 12;

/** Built-in location / activity chips for the Capture session name sheet. */
export const SESSION_NAME_PRESETS = [
	'Atmo',
	'Walk',
	'Home',
	'Urban',
	'Forest',
	'Beach',
	'City',
	'Street',
	'Park',
	'Room',
	'Train',
	'Metro',
	'Market',
	'Cafe',
	'Rain',
	'Night',
	'Door',
	'Hits',
	'Birds',
	'Water',
	'Crowd'
] as const;

export type SessionNamePreset = (typeof SESSION_NAME_PRESETS)[number];

const BUILTIN_LOWER = new Set(SESSION_NAME_PRESETS.map((name) => name.toLowerCase()));

/** Trim, strip em/en dashes, collapse whitespace. Empty → `DEFAULT_SESSION_NAME`. */
export function normalizeSessionName(raw: string): string {
	const cleaned = raw
		.replace(/[\u2014\u2013]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	return cleaned || DEFAULT_SESSION_NAME;
}

export function isBuiltInSessionPreset(name: string): boolean {
	return BUILTIN_LOWER.has(name.trim().toLowerCase());
}

/**
 * Prepend a custom session title to the remembered list.
 * Built-ins and empty/`Session` are ignored. Case-insensitive dedupe; FIFO at `limit`.
 */
export function rememberSessionNamePreset(
	existing: readonly string[],
	rawName: string,
	limit = SESSION_NAME_PRESET_LIMIT
): string[] {
	const name = normalizeSessionName(rawName);
	if (name === DEFAULT_SESSION_NAME || isBuiltInSessionPreset(name)) {
		return [...existing];
	}

	const max = Math.max(0, Math.trunc(limit));
	const next: string[] = [name];
	const seen = new Set([name.toLowerCase()]);

	for (const entry of existing) {
		const cleaned = entry.trim();
		if (!cleaned) continue;
		const key = cleaned.toLowerCase();
		if (seen.has(key) || isBuiltInSessionPreset(cleaned)) continue;
		seen.add(key);
		next.push(cleaned);
		if (next.length >= max) break;
	}

	return next.slice(0, max);
}
