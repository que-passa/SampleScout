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

export function generateTakeMetadata(input: {
	sessionName: string;
	sequence: number;
	recordedAt: string;
	sessionDefaults: SessionDefaults;
	recentTags?: string[];
	presetTags?: string[];
}): TakeMetadata {
	const sequenceLabel = formatSequence(input.sequence);
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
		displayName: `${input.sessionName} — ${sequenceLabel}`,
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

export function createTakeDraft(input: {
	session: CaptureSession;
	sequence: number;
	source: Take['source'];
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
			sessionDefaults: input.session.defaults
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

/** Locally persisted take that has not finished uploading to Audiotool. */
export function isPendingDraftTake(take: Take): boolean {
	return isTakeSavedLocally(take) && take.uploadState !== 'uploaded';
}
