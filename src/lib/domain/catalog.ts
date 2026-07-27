import type { AudioSource, Take } from './types';
import { DEFAULT_SESSION_NAME } from './session-name';

const CATALOG_PREFIX = 'FS';
const CATALOG_ID_LENGTH = 6;

export const SPECIMEN_MARK_SIZE = 12;

/** Neon specimen fill indices — CSS vars `--specimen-neon-0`…`--specimen-neon-20` in tokens.css */
export const SPECIMEN_NEON_COUNT = 21;

export type CatalogReferenceInput = Pick<Take, 'sessionId' | 'sequence'>;

export type SpecimenMarkSourceFacts = Pick<
	AudioSource,
	'durationSeconds' | 'byteLength' | 'channelCount'
>;

export interface SpecimenMarkInput {
	id: Take['id'];
	source: SpecimenMarkSourceFacts;
}

export interface SpecimenMark {
	width: typeof SPECIMEN_MARK_SIZE;
	height: typeof SPECIMEN_MARK_SIZE;
	cells: readonly (readonly boolean[])[];
	/** Index into the specimen neon palette (`--specimen-neon-{n}`). */
	colorIndex: number;
}

/**
 * Derives a local catalog label for display only. It is visual identity, not
 * persisted metadata, and must always be recreated from the session and sequence.
 */
export function deriveCatalogReference({ sessionId, sequence }: CatalogReferenceInput): string {
	const sessionToken = normalizeCatalogId(sessionId);
	const sequenceToken = String(Math.max(0, Math.trunc(sequence))).padStart(3, '0');

	return `${CATALOG_PREFIX}-${sessionToken}-${sequenceToken}`;
}

/** Default Field Session title. Date arg kept for call-site compatibility; unused. */
export function formatFieldSessionName(_date = new Date()): string {
	void _date;
	return DEFAULT_SESSION_NAME;
}

/**
 * Derives a compact visual identity from a take and its source facts.
 * This is not a waveform, audio fingerprint, or quality score.
 */
export function deriveSpecimenMark({ id, source }: SpecimenMarkInput): SpecimenMark {
	const identity = [
		canonicalizeId(id),
		normalizeNumber(source.durationSeconds),
		normalizeNumber(source.byteLength),
		normalizeNumber(source.channelCount ?? 0)
	].join('|');
	const seed = stableHash(identity) || 0x9e3779b9;
	const colorIndex = seed % SPECIMEN_NEON_COUNT;
	let state = seed;
	const cells = Array.from({ length: SPECIMEN_MARK_SIZE }, () =>
		Array.from({ length: SPECIMEN_MARK_SIZE }, () => {
			state ^= state << 13;
			state ^= state >>> 17;
			state ^= state << 5;
			state >>>= 0;
			return (state & 1) === 1;
		})
	);
	const activeCount = cells.flat().filter(Boolean).length;
	const center = Math.floor(SPECIMEN_MARK_SIZE / 2);

	// Keep every mark visibly useful even for an unlikely uniform hash result.
	if (activeCount === 0) cells[center][center] = true;
	if (activeCount === SPECIMEN_MARK_SIZE ** 2) cells[center][center] = false;

	return {
		width: SPECIMEN_MARK_SIZE,
		height: SPECIMEN_MARK_SIZE,
		cells,
		colorIndex
	};
}

function normalizeCatalogId(id: string): string {
	const normalized = canonicalizeId(id)
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, '');

	if (normalized.length >= CATALOG_ID_LENGTH) {
		return normalized.slice(0, CATALOG_ID_LENGTH);
	}

	const fallback = stableHash(canonicalizeId(id))
		.toString(36)
		.toUpperCase()
		.padStart(CATALOG_ID_LENGTH, '0');

	return `${normalized}${fallback}`.slice(0, CATALOG_ID_LENGTH);
}

function canonicalizeId(id: string): string {
	return id.trim().toLowerCase();
}

function normalizeNumber(value: number): string {
	return Number.isFinite(value) ? String(value) : '0';
}

function stableHash(value: string): number {
	let hash = 0x811c9dc5;

	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}

	return hash >>> 0;
}
