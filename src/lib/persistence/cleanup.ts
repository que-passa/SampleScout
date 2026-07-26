import { createAppError, createId, nowIso } from '$lib/domain/ids';
import type { CleanupJob, FileRef, Take, TakeId } from '$lib/domain/types';
import { cloneForIdb } from './clone-for-idb';
import { getDatabase } from './db';
import { deletePath } from './opfs';

export async function putCleanupJob(job: CleanupJob): Promise<void> {
	await getDatabase().cleanupJobs.put(cloneForIdb(job));
}

export async function getCleanupJob(id: string): Promise<CleanupJob | undefined> {
	return getDatabase().cleanupJobs.get(id);
}

export async function deleteCleanupJob(id: string): Promise<void> {
	await getDatabase().cleanupJobs.delete(id);
}

export async function listCleanupJobs(): Promise<CleanupJob[]> {
	return getDatabase().cleanupJobs.toArray();
}

export async function enqueueCleanup(
	fileRefs: FileRef[],
	deleteAfterIso: string
): Promise<CleanupJob> {
	const refs = [...new Set(fileRefs.filter(Boolean))];
	const job: CleanupJob = {
		id: createId(),
		fileRefs: refs,
		createdAt: nowIso(),
		deleteAfter: deleteAfterIso,
		attempts: 0
	};
	await putCleanupJob(job);
	return job;
}

/** Whether a non-deleted take still holds a claim on this OPFS path. */
export function takeHoldsFileRef(take: Take, fileRef: FileRef): boolean {
	if (!fileRef) return false;
	if (take.source.fileRef === fileRef) return true;
	if (take.peaks?.fileRef === fileRef) return true;
	if (take.renderedAsset?.fileRef === fileRef) return true;
	return false;
}

/**
 * True if any take other than `excludeTakeId` (and not fully deleted) still
 * references the file. Used so shared Extract sources are not deleted early.
 */
export async function isFileRefStillHeld(
	fileRef: FileRef,
	options?: { excludeTakeId?: TakeId }
): Promise<boolean> {
	if (!fileRef) return false;
	const takes = await getDatabase().takes.toArray();
	for (const take of takes) {
		if (options?.excludeTakeId && take.id === options.excludeTakeId) continue;
		if (take.lifecycleState === 'deleted') continue;
		if (takeHoldsFileRef(take, fileRef)) return true;
	}
	return false;
}

/** Drop refs that other live takes still need (shared Extract sources / peaks). */
export async function filterUnheldFileRefs(
	fileRefs: FileRef[],
	excludeTakeId?: TakeId
): Promise<FileRef[]> {
	const unique = [...new Set(fileRefs.filter(Boolean))];
	const safe: FileRef[] = [];
	for (const ref of unique) {
		if (!(await isFileRefStillHeld(ref, { excludeTakeId }))) {
			safe.push(ref);
		}
	}
	return safe;
}

/**
 * Delete OPFS binaries for due cleanup jobs. Skips refs still held by live takes
 * (shared Extract sources). Failures stay on the job for retry.
 * Also settles legacy `pending-delete` rows left from the old discard-undo path.
 */
export async function processDueCleanups(now = Date.now()): Promise<{
	processed: number;
	failed: number;
}> {
	const db = getDatabase();
	const stale = await db.takes.toArray();
	for (const take of stale) {
		if (take.lifecycleState === 'pending-delete') {
			await db.takes.put(
				cloneForIdb({
					...take,
					lifecycleState: 'deleted',
					updatedAt: nowIso()
				})
			);
		}
	}

	const jobs = await listCleanupJobs();
	let processed = 0;
	let failed = 0;

	for (const job of jobs) {
		const dueAt = Date.parse(job.deleteAfter);
		if (Number.isNaN(dueAt) || dueAt > now) continue;

		try {
			for (const ref of job.fileRefs) {
				if (await isFileRefStillHeld(ref)) continue;
				await deletePath(ref);
			}
			await deleteCleanupJob(job.id);
			processed += 1;
		} catch (cause) {
			failed += 1;
			const error = createAppError(
				'CLEANUP_FAILED',
				'Deferred file cleanup failed and will retry.',
				{ cause, recoverable: true, context: { cleanupId: job.id } }
			);
			await putCleanupJob({
				...job,
				attempts: job.attempts + 1,
				lastError: error
			});
		}
	}

	return { processed, failed };
}
