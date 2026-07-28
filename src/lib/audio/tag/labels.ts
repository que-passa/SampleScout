/** AudioSet labels that are too broad to be useful upload tags on their own. */
const GENERIC_LABELS = new Set([
	'sound',
	'noise',
	'silence',
	'audio',
	'other',
	'miscellaneous',
	'environmental noise',
	'background noise',
	'white noise',
	'static'
]);

/** Prefer short, field-recording-friendly slugs for common AudioSet names. */
const LABEL_ALIASES: Record<string, string> = {
	rain: 'rain',
	thunder: 'thunder',
	thunderstorm: 'thunder',
	'rain on surface': 'rain',
	wind: 'wind',
	bird: 'bird',
	birds: 'bird',
	'bird vocalization, bird call, bird song': 'bird',
	dog: 'dog',
	bark: 'dog',
	cat: 'cat',
	meow: 'cat',
	crowd: 'crowd',
	'people talking': 'crowd',
	'people speaking': 'speech',
	speech: 'speech',
	music: 'music',
	door: 'door',
	'door knock': 'door',
	knock: 'door',
	footsteps: 'footsteps',
	'walking, footsteps': 'footsteps',
	water: 'water',
	'water tap, faucet': 'water',
	fire: 'fire',
	crackle: 'fire',
	engine: 'engine',
	vehicle: 'traffic',
	traffic: 'traffic',
	train: 'train',
	siren: 'siren',
	alarm: 'alarm',
	metro: 'metro',
	subway: 'metro',
	market: 'market',
	insect: 'insect',
	frog: 'frog',
	ocean: 'ocean',
	waves: 'ocean',
	surf: 'ocean'
};

export function normalizeAudiosetLabel(label: string): string {
	return label.trim().toLowerCase();
}

export function isGenericAudiosetLabel(label: string): boolean {
	return GENERIC_LABELS.has(normalizeAudiosetLabel(label));
}

/** Map an AudioSet category name to a compact upload tag slug. */
export function audiosetLabelToTag(label: string): string | null {
	const normalized = normalizeAudiosetLabel(label);
	if (!normalized || isGenericAudiosetLabel(normalized)) return null;

	const alias = LABEL_ALIASES[normalized];
	if (alias) return alias;

	const primary = normalized.split(',')[0]?.trim() ?? normalized;
	const slug = primary
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 32);
	return slug || null;
}

export interface ScoredCategory {
	categoryName: string;
	score: number;
}

/** Pick content tags from aggregated YAMNet scores (empty when nothing clears the threshold). */
export function selectTagsFromScores(
	scores: readonly ScoredCategory[],
	options?: { minScore?: number; maxTags?: number }
): string[] {
	const minScore = options?.minScore ?? 0;
	const maxTags = options?.maxTags ?? 5;

	const byTag = new Map<string, number>();
	for (const entry of scores) {
		if (!Number.isFinite(entry.score) || entry.score < minScore) continue;
		const tag = audiosetLabelToTag(entry.categoryName);
		if (!tag) continue;
		const prev = byTag.get(tag) ?? 0;
		if (entry.score > prev) byTag.set(tag, entry.score);
	}

	const ranked = [...byTag.entries()].sort((a, b) => b[1] - a[1]).map(([tag]) => tag);
	return ranked.slice(0, maxTags);
}
