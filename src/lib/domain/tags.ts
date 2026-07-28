/** Max custom tags remembered on this device for Field Notes suggestions. */
export const TAG_RECENT_LIMIT = 12;

/** Hidden tags — applied at upload or as internal fallbacks; never shown in Field Notes UI. */
export const HIDDEN_SYSTEM_TAGS = ['recording', 'sample-scout'] as const;

export const AUDIOTOOL_RECORDING_TAG = 'recording';

/** Built-in sample-identity tag chips for Field Notes (role, material, perc, character). */
export const TAG_PRESETS = [
	'atmo',
	'foley',
	'sfx',
	'vox',
	'texture',
	'metal',
	'wood',
	'glass',
	'stone',
	'plastic',
	'fabric',
	'grass',
	'sand',
	'click',
	'whoosh',
	'rustle',
	'hit',
	'kick',
	'snare',
	'hihat',
	'rim',
	'clap',
	'tom',
	'cymbal',
	'shaker',
	'perc',
	'soft',
	'hard',
	'bright',
	'dark'
] as const;

export type TagPreset = (typeof TAG_PRESETS)[number];

const BUILTIN_LOWER = new Set(TAG_PRESETS.map((tag) => tag.toLowerCase()));
const HIDDEN_LOWER = new Set(HIDDEN_SYSTEM_TAGS.map((tag) => tag.toLowerCase()));

/** Trim and collapse internal whitespace. */
export function normalizeTag(raw: string): string {
	return raw.replace(/\s+/g, ' ').trim();
}

export function tagKey(tag: string): string {
	return normalizeTag(tag).toLowerCase();
}

export function isHiddenSystemTag(tag: string): boolean {
	return HIDDEN_LOWER.has(tagKey(tag));
}

export function isBuiltInTagPreset(tag: string): boolean {
	return BUILTIN_LOWER.has(tagKey(tag));
}

export function hasTag(tags: readonly string[], candidate: string): boolean {
	const key = tagKey(candidate);
	if (!key) return false;
	return tags.some((tag) => tagKey(tag) === key);
}

export function tagsEqual(a: readonly string[], b: readonly string[]): boolean {
	if (a.length !== b.length) return false;
	return a.every((tag, index) => tag === b[index]);
}

export function addTag(tags: readonly string[], raw: string): string[] {
	const tag = normalizeTag(raw);
	if (!tag || hasTag(tags, tag) || isHiddenSystemTag(tag)) return [...tags];
	return [...tags, tag];
}

export function addTags(tags: readonly string[], raw: readonly string[]): string[] {
	let next = [...tags];
	for (const entry of raw) {
		next = addTag(next, entry);
	}
	return next;
}

export function removeTag(tags: readonly string[], raw: string): string[] {
	const key = tagKey(raw);
	if (!key) return [...tags];
	return tags.filter((tag) => tagKey(tag) !== key);
}

/** Field Notes tags visible to the user (excludes hidden system tags). */
export function visibleTags(tags: readonly string[]): string[] {
	return tags.filter((tag) => !isHiddenSystemTag(tag));
}

/** Parse comma/semicolon/newline-separated text into unique tags (case-insensitive dedupe). */
export function parseTagList(raw: string): string[] {
	const parts: string[] = [];
	for (const segment of raw.split(/[,;\n]+/)) {
		const tag = normalizeTag(segment);
		if (tag) parts.push(tag);
	}
	return addTags([], parts);
}

export function formatTagList(tags: readonly string[]): string {
	return tags.join(', ');
}

/**
 * Prepend tags from a save/apply action to the remembered list.
 * Case-insensitive dedupe; FIFO at `limit`.
 */
export function rememberRecentTags(
	existing: readonly string[],
	used: readonly string[],
	limit = TAG_RECENT_LIMIT
): string[] {
	const max = Math.max(0, Math.trunc(limit));
	const next: string[] = [];
	const seen = new Set<string>();

	for (const raw of used) {
		const tag = normalizeTag(raw);
		if (!tag || isHiddenSystemTag(tag)) continue;
		const key = tagKey(tag);
		if (seen.has(key)) continue;
		seen.add(key);
		next.push(tag);
	}

	for (const entry of existing) {
		const cleaned = normalizeTag(entry);
		if (!cleaned || isHiddenSystemTag(cleaned)) continue;
		const key = tagKey(cleaned);
		if (seen.has(key)) continue;
		seen.add(key);
		next.push(cleaned);
		if (next.length >= max) break;
	}

	return next.slice(0, max);
}
