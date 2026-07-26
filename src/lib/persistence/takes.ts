import { createAppError, formatSequence, nowIso } from '$lib/domain/ids';
import { buildExtractTakeDraft } from '$lib/domain/extract';
import {
	applyTakeMetadataPatch,
	isPendingDraftTake,
	type TakeMetadataPatch
} from '$lib/domain/metadata';
import type { CaptureSession, Take, TakeId } from '$lib/domain/types';
import { cloneForIdb } from './clone-for-idb';
import { getDatabase } from './db';
import { enqueueCleanup, filterUnheldFileRefs } from './cleanup';
import { removeTakeFromSession, appendTakeToSession } from './sessions';

export async function putTake(take: Take): Promise<void> {
	await getDatabase().takes.put(cloneForIdb(take));
}

export async function getTake(id: TakeId): Promise<Take | undefined> {
	return getDatabase().takes.get(id);
}

/** Visible takes for a session (newest sequence first). Hides pending-delete / deleted. */
export async function listTakesForSession(sessionId: string): Promise<Take[]> {
	const takes = await getDatabase().takes.where('sessionId').equals(sessionId).toArray();
	takes.sort((a, b) => b.sequence - a.sequence);
	return takes.filter((take) => take.lifecycleState === 'saved');
}

export async function listSavedTakesNewestFirst(): Promise<Take[]> {
	const takes = await getDatabase().takes.toArray();
	return takes
		.filter((take) => take.lifecycleState === 'saved')
		.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Count of locally saved takes that are not yet uploaded. */
export async function countPendingDraftTakes(): Promise<number> {
	const takes = await listSavedTakesNewestFirst();
	return takes.filter(isPendingDraftTake).length;
}

export async function nextSequenceForSession(sessionId: string): Promise<number> {
	const takes = await getDatabase().takes.where('sessionId').equals(sessionId).toArray();
	if (takes.length === 0) return 1;
	return Math.max(...takes.map((take) => take.sequence)) + 1;
}

/**
 * Commit binary-backed take metadata and append to session order.
 * Caller must already have flushed the OPFS source binary.
 */
export async function commitSavedTake(
	take: Take,
	session: CaptureSession
): Promise<{ take: Take; session: CaptureSession }> {
	const stamped: Take = {
		...take,
		lifecycleState: 'saved',
		updatedAt: nowIso()
	};

	const db = getDatabase();
	await db.transaction('rw', db.takes, db.sessions, async () => {
		await putTake(stamped);
		const updatedSession = await appendTakeToSession(session.id, stamped.id);
		if (!updatedSession) {
			throw new Error(`Session ${session.id} missing during take commit`);
		}
		session = updatedSession;
	});

	return { take: stamped, session };
}

export async function updateTake(take: Take): Promise<Take> {
	const updated: Take = { ...take, updatedAt: nowIso() };
	await putTake(updated);
	return updated;
}

export async function renameTake(takeId: TakeId, displayName: string): Promise<Take> {
	const take = await getTake(takeId);
	if (!take || take.lifecycleState !== 'saved') {
		throw createAppError('TAKE_NOT_FOUND', 'Take is not available to rename.', {
			recoverable: true,
			context: { takeId }
		});
	}

	const trimmed = displayName.trim();
	if (!trimmed) {
		throw createAppError('TAKE_NAME_EMPTY', 'Take name cannot be empty.', {
			recoverable: true,
			context: { takeId }
		});
	}

	return updateTake({
		...take,
		metadata: applyTakeMetadataPatch(take.metadata, { displayName: trimmed })
	});
}

/** Persist Field Notes fields. Source binary and edit recipe are unchanged. */
export async function updateTakeMetadata(takeId: TakeId, patch: TakeMetadataPatch): Promise<Take> {
	const take = await getTake(takeId);
	if (!take || take.lifecycleState !== 'saved') {
		throw createAppError('TAKE_NOT_FOUND', 'Take is not available to update Field Notes.', {
			recoverable: true,
			context: { takeId }
		});
	}

	if (patch.displayName !== undefined && !patch.displayName.trim()) {
		throw createAppError('TAKE_NAME_EMPTY', 'Take name cannot be empty.', {
			recoverable: true,
			context: { takeId }
		});
	}

	if (patch.kind === 'loop' && patch.bpm !== undefined && patch.bpm !== null) {
		if (!Number.isFinite(patch.bpm) || patch.bpm <= 0) {
			throw createAppError('TAKE_BPM_INVALID', 'BPM must be a positive number.', {
				recoverable: true,
				context: { takeId, bpm: patch.bpm }
			});
		}
	}

	const metadata = applyTakeMetadataPatch(take.metadata, patch);
	return updateTake({ ...take, metadata });
}

/** Persist a non-destructive edit recipe. Source binary is unchanged. */
export async function updateTakeEditRecipe(
	takeId: TakeId,
	editRecipe: Take['editRecipe']
): Promise<Take> {
	const take = await getTake(takeId);
	if (!take || take.lifecycleState !== 'saved') {
		throw createAppError('TAKE_NOT_FOUND', 'Take is not available to edit.', {
			recoverable: true,
			context: { takeId }
		});
	}

	const previousRef = take.renderedAsset?.fileRef;
	const updated = await updateTake({
		...take,
		editRecipe,
		// Stale rendered export must not outlive a recipe change.
		renderedAsset: undefined,
		reviewState: take.reviewState === 'unreviewed' ? 'edited' : take.reviewState
	});
	await scheduleRenderedCleanup(previousRef);
	return updated;
}

function outputSettingsEqual(a: Take['output'], b: Take['output']): boolean {
	if (a.format !== b.format) return false;
	if (a.format === 'wav' && b.format === 'wav') return a.bitDepth === b.bitDepth;
	if (a.format === 'mp3' && b.format === 'mp3') return a.bitrateKbps === b.bitrateKbps;
	return true;
}

async function scheduleRenderedCleanup(fileRef: string | undefined): Promise<void> {
	if (!fileRef) return;
	try {
		await enqueueCleanup([fileRef], nowIso());
	} catch {
		/* best-effort */
	}
}

/** Persist export format settings. Clears a stale rendered asset when settings change. */
export async function updateTakeOutput(
	takeId: TakeId,
	output: Take['output']
): Promise<Take> {
	const take = await getTake(takeId);
	if (!take || take.lifecycleState !== 'saved') {
		throw createAppError('TAKE_NOT_FOUND', 'Take is not available to update export settings.', {
			recoverable: true,
			context: { takeId }
		});
	}

	if (outputSettingsEqual(take.output, output)) {
		return take;
	}

	const previousRef = take.renderedAsset?.fileRef;
	const updated = await updateTake({
		...take,
		output,
		renderedAsset: undefined
	});
	await scheduleRenderedCleanup(previousRef);
	return updated;
}

/**
 * Remove a take from the Collection and schedule binary cleanup immediately.
 * Shared Extract sources stay while other takes still reference them.
 */
export async function discardTake(takeId: TakeId): Promise<Take> {
	const take = await getTake(takeId);
	if (!take || take.lifecycleState !== 'saved') {
		throw createAppError('TAKE_NOT_FOUND', 'Take is not available to discard.', {
			recoverable: true,
			context: { takeId }
		});
	}

	const candidateRefs = [
		take.source.fileRef,
		take.peaks?.fileRef,
		take.renderedAsset?.fileRef
	].filter((ref): ref is string => Boolean(ref));

	const db = getDatabase();
	const deletedAt = nowIso();

	await db.transaction('rw', db.takes, db.sessions, db.cleanupJobs, async () => {
		const deleted: Take = {
			...take,
			lifecycleState: 'deleted',
			updatedAt: deletedAt
		};
		await putTake(deleted);
		await removeTakeFromSession(take.sessionId, takeId);
		const fileRefs = await filterUnheldFileRefs(candidateRefs, takeId);
		await enqueueCleanup(fileRefs, deletedAt);
	});

	const deleted = await getTake(takeId);
	if (!deleted) {
		throw createAppError('DISCARD_FAILED', 'Take disappeared during discard.', {
			recoverable: true,
			context: { takeId }
		});
	}

	return deleted;
}

/**
 * Create a Local Draft from a selection on an existing take.
 * Shares the parent OPFS source; commits metadata only (source already on disk).
 */
export async function extractTakeFromSelection(input: {
	parentTakeId: TakeId;
	startSeconds: number;
	endSeconds: number;
}): Promise<Take> {
	const parent = await getTake(input.parentTakeId);
	if (!parent || parent.lifecycleState !== 'saved') {
		throw createAppError('EXTRACT_PARENT_INVALID', 'Take is not available to extract from.', {
			recoverable: true,
			context: { takeId: input.parentTakeId }
		});
	}

	const session = await getDatabase().sessions.get(parent.sessionId);
	if (!session) {
		throw createAppError('EXTRACT_SESSION_MISSING', 'Field Session is missing for this take.', {
			recoverable: true,
			context: { takeId: parent.id, sessionId: parent.sessionId }
		});
	}

	let draft: Take;
	try {
		const sequence = await nextSequenceForSession(session.id);
		draft = buildExtractTakeDraft({
			parent,
			session,
			sequence,
			startSeconds: input.startSeconds,
			endSeconds: input.endSeconds
		});
	} catch (cause) {
		const message =
			cause instanceof Error && cause.message.trim()
				? cause.message
				: 'Could not extract selection.';
		throw createAppError('EXTRACT_FAILED', message, {
			recoverable: true,
			cause,
			context: { takeId: parent.id }
		});
	}

	const { take } = await commitSavedTake(draft, session);
	return take;
}

export function formatTakeLabel(take: Take): string {
	return take.metadata.displayName || `Take ${formatSequence(take.sequence)}`;
}
