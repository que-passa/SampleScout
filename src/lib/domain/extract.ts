import { createId, nowIso } from './ids';
import { createInitialEditRecipe, generateTakeMetadata, stemFromSessionName } from './metadata';
import { MIN_SEGMENT_SECONDS, retainedSourceRanges, trimToSelection } from './edit-recipe';
import type { CaptureSession, EditRecipe, Take, TakeId } from './types';

/**
 * Source bounds for Collect from the current retained trim.
 * Returns null when the recipe is a full-source single span (no trim result)
 * or when retained geometry is not a single collectable segment.
 */
export function collectableRetainedBounds(
	recipe: EditRecipe,
	sourceDurationSeconds: number
): { start: number; end: number } | null {
	if (sourceDurationSeconds <= 0) return null;
	const ranges = retainedSourceRanges(recipe);
	if (ranges.length !== 1) return null;
	const range = ranges[0];
	if (!range) return null;
	const start = range.start;
	const end = range.end;
	if (end - start < MIN_SEGMENT_SECONDS) return null;
	const isFullSource = start <= 1e-9 && Math.abs(end - sourceDurationSeconds) <= 1e-6;
	if (isFullSource) return null;
	return { start, end };
}

/**
 * Build a new Local File from a parent retained trim (Collect). Shares the
 * parent source binary; recipe retains only the trim bounds. Does not write storage.
 */
export function buildExtractTake(input: {
	parent: Take;
	session: CaptureSession;
	sequence: number;
	startSeconds: number;
	endSeconds: number;
	/** Prior display names in session order (oldest → newest). */
	existingDisplayNames?: string[];
	titleStem?: string;
}): Take {
	const { parent, session, sequence } = input;
	if (parent.lifecycleState !== 'saved') {
		throw new Error('Only a saved Local File can be collected from.');
	}

	const start = Math.min(input.startSeconds, input.endSeconds);
	const end = Math.max(input.startSeconds, input.endSeconds);
	if (end - start < MIN_SEGMENT_SECONDS) {
		throw new Error(`Trim must be at least ${MIN_SEGMENT_SECONDS * 1000} ms.`);
	}

	if (start < -1e-9 || end > parent.source.durationSeconds + 1e-6) {
		throw new Error('Trim is outside the source duration.');
	}

	if (!parent.source.fileRef) {
		throw new Error('Parent take has no local source file.');
	}

	const timestamp = nowIso();
	const stem = input.titleStem ?? stemFromSessionName(session.name);
	const metadata = generateTakeMetadata({
		sessionName: session.name,
		sequence,
		recordedAt: timestamp,
		sessionDefaults: session.defaults,
		existingDisplayNames: input.existingDisplayNames,
		titleStem: stem
	});

	const identity = createInitialEditRecipe(parent.source.durationSeconds);
	const editRecipe = trimToSelection(identity, start, end);

	return {
		id: createId(),
		sessionId: session.id,
		sequence,
		createdAt: timestamp,
		updatedAt: timestamp,
		source: { ...parent.source },
		metadata,
		editRecipe,
		output: session.defaults.output,
		derivedFromTakeId: parent.id as TakeId,
		lifecycleState: 'finalizing',
		reviewState: 'edited',
		uploadState: 'not-queued'
	};
}

/** @deprecated Clock labels are no longer used in Collect display names. */
export function formatExtractClock(seconds: number): string {
	const clamped = Math.max(0, seconds);
	const mins = Math.floor(clamped / 60);
	const secs = clamped - mins * 60;
	const whole = Math.floor(secs);
	const ms = Math.floor((secs - whole) * 1000);
	return `${String(mins).padStart(2, '0')}:${String(whole).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

/** @deprecated Prefer numbered stem names via {@link nextNumberedDisplayName}. */
export function formatExtractDisplayName(
	parentDisplayName: string,
	startSeconds: number,
	endSeconds: number
): string {
	const parent = parentDisplayName.trim() || 'Take';
	const start = Math.min(startSeconds, endSeconds);
	const end = Math.max(startSeconds, endSeconds);
	return `${parent} ${formatExtractClock(start)} ${formatExtractClock(end)}`;
}
