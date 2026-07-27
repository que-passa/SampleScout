import { createId, formatSequence, nowIso } from './ids';
import { formatFieldSessionName } from './catalog';
import type {
	CaptureSession,
	EditRecipe,
	MetadataOrigin,
	OutputSettings,
	SampleKind,
	SessionDefaults,
	Take,
	TakeMetadata,
	Visibility
} from './types';

/** Partial Field Notes update. Only provided keys are written; each becomes `manual`. */
export type TakeMetadataPatch = {
	displayName?: string;
	description?: string;
	tags?: string[];
	kind?: SampleKind;
	visibility?: Visibility;
	/** When kind is one-shot, bpm is cleared. Pass a number for loop BPM. */
	bpm?: number | null;
};

const ORIGIN_LABELS: Record<MetadataOrigin, string> = {
	'application-default': 'App default',
	'user-preference': 'Preference',
	'session-default': 'Session default',
	generated: 'Generated',
	manual: 'Manual'
};

export function formatMetadataOrigin(origin: MetadataOrigin | undefined): string {
	if (!origin) return '';
	return ORIGIN_LABELS[origin] ?? origin;
}

/** Parse a comma/whitespace tag string into unique non-empty tags. */
export function parseTagList(raw: string): string[] {
	const seen = new Set<string>();
	const tags: string[] = [];
	for (const part of raw.split(/[,;\n]+/)) {
		const tag = part.trim();
		if (!tag || seen.has(tag)) continue;
		seen.add(tag);
		tags.push(tag);
	}
	return tags;
}

export function formatTagList(tags: string[]): string {
	return tags.join(', ');
}

function tagsEqual(a: string[], b: string[]): boolean {
	if (a.length !== b.length) return false;
	return a.every((tag, index) => tag === b[index]);
}

/**
 * Apply a Field Notes patch. Changed fields are marked `manual`.
 * Manual values are never overwritten by callers that omit a field.
 * Switching to one-shot clears BPM; loop without an explicit bpm leaves existing bpm.
 */
export function applyTakeMetadataPatch(
	metadata: TakeMetadata,
	patch: TakeMetadataPatch
): TakeMetadata {
	const next: TakeMetadata = {
		...metadata,
		tags: [...metadata.tags],
		provenance: { ...metadata.provenance }
	};

	if (patch.displayName !== undefined) {
		const trimmed = patch.displayName.trim();
		if (trimmed && trimmed !== metadata.displayName) {
			next.displayName = trimmed;
			next.provenance.displayName = 'manual';
		}
	}

	if (patch.description !== undefined && patch.description !== metadata.description) {
		next.description = patch.description;
		next.provenance.description = 'manual';
	}

	if (patch.tags !== undefined && !tagsEqual(patch.tags, metadata.tags)) {
		next.tags = [...patch.tags];
		next.provenance.tags = 'manual';
	}

	if (patch.kind !== undefined && patch.kind !== metadata.kind) {
		next.kind = patch.kind;
		next.provenance.kind = 'manual';
		if (patch.kind === 'one-shot') {
			delete next.bpm;
			delete next.provenance.bpm;
		}
	}

	if (patch.visibility !== undefined && patch.visibility !== metadata.visibility) {
		next.visibility = patch.visibility;
		next.provenance.visibility = 'manual';
	}

	const effectiveKind = next.kind;

	if (effectiveKind === 'one-shot') {
		delete next.bpm;
		delete next.provenance.bpm;
	} else if (patch.bpm !== undefined) {
		if (patch.bpm === null) {
			if (metadata.bpm !== undefined) {
				delete next.bpm;
				delete next.provenance.bpm;
			}
		} else if (patch.bpm !== metadata.bpm) {
			next.bpm = patch.bpm;
			next.provenance.bpm = 'manual';
		}
	}

	return next;
}

const DEFAULT_OUTPUT: OutputSettings = {
	format: 'wav',
	bitDepth: 16
};

export function createSessionDefaults(overrides: Partial<SessionDefaults> = {}): SessionDefaults {
	return {
		tags: [],
		descriptionTemplate: '',
		kind: 'one-shot',
		visibility: 'unlisted',
		output: DEFAULT_OUTPUT,
		...overrides
	};
}

export function createSession(name = formatFieldSessionName()): CaptureSession {
	const timestamp = nowIso();
	return {
		id: createId(),
		name,
		createdAt: timestamp,
		updatedAt: timestamp,
		status: 'active',
		defaults: createSessionDefaults(),
		takeOrder: []
	};
}

export function createInitialEditRecipe(durationSeconds: number): EditRecipe {
	return {
		version: 1,
		segments: [
			{
				id: createId(),
				sourceStartSeconds: 0,
				sourceEndSeconds: durationSeconds,
				fadeInSeconds: 0,
				fadeOutSeconds: 0,
				gainDb: 0
			}
		]
	};
}

export function formatRecordingDate(isoDate: string): string {
	const date = new Date(isoDate);
	return new Intl.DateTimeFormat('en-GB', {
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	}).format(date);
}

/** Compact Collection session stamp, e.g. `27/07`. */
export function formatShortDate(isoDate: string): string {
	const date = new Date(isoDate);
	if (Number.isNaN(date.getTime())) return '';
	const day = String(date.getDate()).padStart(2, '0');
	const month = String(date.getMonth() + 1).padStart(2, '0');
	return `${day}/${month}`;
}

/** Compact Collection row stamp, e.g. `27/07/17:41`. */
export function formatShortDateTime(isoDate: string): string {
	const date = new Date(isoDate);
	if (Number.isNaN(date.getTime())) return '';
	const day = String(date.getDate()).padStart(2, '0');
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const hours = String(date.getHours()).padStart(2, '0');
	const minutes = String(date.getMinutes()).padStart(2, '0');
	return `${day}/${month}/${hours}:${minutes}`;
}

/** Strip em/en dashes and collapse whitespace for display-name stems. */
export function sanitizeDisplayNameStem(raw: string): string {
	return raw
		.replace(/[\u2014\u2013]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * Short stem from a Field Session title. Legacy “Field Session · …” names
 * compress to day+month; default `Session` and user titles keep the cleaned name.
 */
export function stemFromSessionName(sessionName: string): string {
	const cleaned = sanitizeDisplayNameStem(sessionName);
	if (!cleaned) return 'Take';
	const fieldMatch = cleaned.match(/^Field Session\s*[·.]\s*(.+)$/i);
	if (fieldMatch?.[1]) {
		const rest = fieldMatch[1].trim();
		const dayMonth = rest.match(/^(\d{1,2}\s+[A-Za-z]{3})\b/);
		if (dayMonth?.[1]) return dayMonth[1];
		const beforeDot = rest.split(/\s*[·.]\s*/)[0]?.trim();
		return beforeDot || 'Session';
	}
	return cleaned;
}

export function formatNumberedDisplayName(stem: string, number: number): string {
	const safeStem = sanitizeDisplayNameStem(stem) || 'Take';
	const n = Math.max(1, Math.trunc(number));
	const label = n < 100 ? String(n).padStart(2, '0') : String(n);
	return `${safeStem} ${label}`;
}

/** Parse `Stem 01` style names. Returns null when no trailing number. */
export function parseNumberedDisplayName(
	displayName: string
): { stem: string; number: number } | null {
	const cleaned = sanitizeDisplayNameStem(displayName);
	const match = cleaned.match(/^(.*)\s+(\d+)$/);
	if (!match?.[1] || !match[2]) return null;
	const stem = match[1].trim();
	if (!stem) return null;
	const number = Number.parseInt(match[2], 10);
	if (!Number.isFinite(number) || number < 1) return null;
	return { stem, number };
}

/**
 * Next `Stem NN` after existing session names. Continues the counter when the
 * last numbered name shares this stem; otherwise starts at 01.
 */
export function nextNumberedDisplayName(stem: string, existingDisplayNames: string[]): string {
	const safeStem = sanitizeDisplayNameStem(stem) || 'Take';
	for (let i = existingDisplayNames.length - 1; i >= 0; i -= 1) {
		const parsed = parseNumberedDisplayName(existingDisplayNames[i] ?? '');
		if (!parsed) continue;
		if (parsed.stem.toLowerCase() === safeStem.toLowerCase()) {
			return formatNumberedDisplayName(safeStem, parsed.number + 1);
		}
		return formatNumberedDisplayName(safeStem, 1);
	}
	return formatNumberedDisplayName(safeStem, 1);
}

/** Assign contiguous `Stem 01`… names for a batch upload overlay. */
export function assignNumberedDisplayNames(stem: string, count: number): string[] {
	const n = Math.max(0, Math.trunc(count));
	return Array.from({ length: n }, (_, index) => formatNumberedDisplayName(stem, index + 1));
}

export function generateTakeMetadata(input: {
	sessionName: string;
	sequence: number;
	recordedAt: string;
	sessionDefaults: SessionDefaults;
	recentTags?: string[];
	presetTags?: string[];
	/** Prior display names in session order (oldest → newest) for Stem NN continuity. */
	existingDisplayNames?: string[];
	/** Override stem; defaults to {@link stemFromSessionName}. */
	titleStem?: string;
}): TakeMetadata {
	const sequenceLabel = formatSequence(input.sequence);
	const stem = sanitizeDisplayNameStem(input.titleStem ?? stemFromSessionName(input.sessionName));
	const displayName = nextNumberedDisplayName(stem, input.existingDisplayNames ?? []);
	const tags =
		input.sessionDefaults.tags.length > 0
			? [...input.sessionDefaults.tags]
			: input.recentTags && input.recentTags.length > 0
				? [...input.recentTags]
				: input.presetTags && input.presetTags.length > 0
					? [...input.presetTags]
					: ['recording'];

	const tagOrigin =
		input.sessionDefaults.tags.length > 0
			? 'session-default'
			: input.recentTags && input.recentTags.length > 0
				? 'user-preference'
				: input.presetTags && input.presetTags.length > 0
					? 'application-default'
					: 'application-default';

	return {
		displayName,
		description: `Recorded during “${input.sessionName}” on ${formatRecordingDate(input.recordedAt)}. Take ${sequenceLabel}.`,
		tags,
		kind: input.sessionDefaults.kind,
		visibility: input.sessionDefaults.visibility,
		bpm: input.sessionDefaults.kind === 'loop' ? input.sessionDefaults.bpm : undefined,
		provenance: {
			displayName: 'generated',
			description: 'generated',
			tags: tagOrigin,
			kind: input.sessionDefaults.kind === 'one-shot' ? 'application-default' : 'session-default',
			visibility:
				input.sessionDefaults.visibility === 'unlisted' ? 'application-default' : 'session-default',
			bpm:
				input.sessionDefaults.kind === 'loop' && input.sessionDefaults.bpm !== undefined
					? 'session-default'
					: undefined
		}
	};
}

export function createTake(input: {
	session: CaptureSession;
	sequence: number;
	source: Take['source'];
	existingDisplayNames?: string[];
	titleStem?: string;
}): Take {
	const timestamp = nowIso();
	return {
		id: createId(),
		sessionId: input.session.id,
		sequence: input.sequence,
		createdAt: timestamp,
		updatedAt: timestamp,
		source: input.source,
		metadata: generateTakeMetadata({
			sessionName: input.session.name,
			sequence: input.sequence,
			recordedAt: timestamp,
			sessionDefaults: input.session.defaults,
			existingDisplayNames: input.existingDisplayNames,
			titleStem: input.titleStem
		}),
		editRecipe: createInitialEditRecipe(input.source.durationSeconds),
		output: input.session.defaults.output,
		lifecycleState: 'finalizing',
		reviewState: 'unreviewed',
		uploadState: 'not-queued'
	};
}

/** A take may be labeled Saved locally only after binary + metadata commit. */
export function isTakeSavedLocally(take: Take): boolean {
	return take.lifecycleState === 'saved' && Boolean(take.source.fileRef);
}

/** Locally persisted take that has not finished uploading to Audiotool (ignores children). */
export function isPendingFileTake(take: Take): boolean {
	return isTakeSavedLocally(take) && take.uploadState !== 'uploaded';
}

/** True when any take was Collected from this parent. */
export function takeHasCollectedChildren(takeId: Take['id'], allTakes: readonly Take[]): boolean {
	return allTakes.some((candidate) => candidate.derivedFromTakeId === takeId);
}

/**
 * Upload-pending: Local File, not uploaded, and no collected children.
 * Lone parents stay pending; parents with children are source-only for shipping.
 */
export function isUploadPendingTake(take: Take, allTakes: readonly Take[]): boolean {
	return isPendingFileTake(take) && !takeHasCollectedChildren(take.id, allTakes);
}
