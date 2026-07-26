import { createId, nowIso } from './ids';
import { createInitialEditRecipe, generateTakeMetadata } from './metadata';
import { MIN_SEGMENT_SECONDS, trimToSelection } from './edit-recipe';
import type { CaptureSession, Take, TakeId } from './types';

/** Clock label for extract names (mm:ss.mmm on source timeline). */
export function formatExtractClock(seconds: number): string {
	const clamped = Math.max(0, seconds);
	const mins = Math.floor(clamped / 60);
	const secs = clamped - mins * 60;
	const whole = Math.floor(secs);
	const ms = Math.floor((secs - whole) * 1000);
	return `${String(mins).padStart(2, '0')}:${String(whole).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

export function formatExtractDisplayName(
	parentDisplayName: string,
	startSeconds: number,
	endSeconds: number
): string {
	const parent = parentDisplayName.trim() || 'Take';
	const start = Math.min(startSeconds, endSeconds);
	const end = Math.max(startSeconds, endSeconds);
	return `${parent} · ${formatExtractClock(start)}–${formatExtractClock(end)}`;
}

/**
 * Build a new Local Draft from a parent selection. Shares the parent source binary;
 * recipe retains only the selection. Does not write storage.
 */
export function buildExtractTakeDraft(input: {
	parent: Take;
	session: CaptureSession;
	sequence: number;
	startSeconds: number;
	endSeconds: number;
}): Take {
	const { parent, session, sequence } = input;
	if (parent.lifecycleState !== 'saved') {
		throw new Error('Only a saved Local Draft can be extracted from.');
	}

	const start = Math.min(input.startSeconds, input.endSeconds);
	const end = Math.max(input.startSeconds, input.endSeconds);
	if (end - start < MIN_SEGMENT_SECONDS) {
		throw new Error(`Selection must be at least ${MIN_SEGMENT_SECONDS * 1000} ms.`);
	}

	if (start < -1e-9 || end > parent.source.durationSeconds + 1e-6) {
		throw new Error('Selection is outside the source duration.');
	}

	if (!parent.source.fileRef) {
		throw new Error('Parent take has no local source file.');
	}

	const timestamp = nowIso();
	const metadata = generateTakeMetadata({
		sessionName: session.name,
		sequence,
		recordedAt: timestamp,
		sessionDefaults: session.defaults
	});
	metadata.displayName = formatExtractDisplayName(parent.metadata.displayName, start, end);
	metadata.provenance = {
		...metadata.provenance,
		displayName: 'generated'
	};

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
