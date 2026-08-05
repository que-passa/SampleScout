import { describe, expect, it, vi, afterEach } from 'vitest';
import { createSession, createTake } from '$lib/domain/metadata';
import type { CleanupJob, CaptureSession, Take } from '$lib/domain/types';
import { sourcePath } from '$lib/persistence/paths';

const takes = new Map<string, Take>();
const sessions = new Map<string, CaptureSession>();
const cleanupJobs = new Map<string, CleanupJob>();
const suggestedRegions = new Map<string, unknown>();

vi.mock('$lib/persistence/db', () => ({
	getDatabase: () => ({
		takes: {
			put: async (take: Take) => {
				takes.set(take.id, structuredClone(take));
			},
			get: async (id: string) => {
				const t = takes.get(id);
				return t ? structuredClone(t) : undefined;
			},
			where: () => ({
				equals: (sessionId: string) => ({
					toArray: async () =>
						[...takes.values()]
							.filter((t) => t.sessionId === sessionId)
							.map((t) => structuredClone(t))
				})
			}),
			toArray: async () => [...takes.values()].map((t) => structuredClone(t))
		},
		sessions: {
			get: async (id: string) => {
				const s = sessions.get(id);
				return s ? structuredClone(s) : undefined;
			},
			put: async (session: CaptureSession) => {
				sessions.set(session.id, structuredClone(session));
			}
		},
		cleanupJobs: {
			put: async (job: CleanupJob) => {
				cleanupJobs.set(job.id, structuredClone(job));
			},
			get: async (id: string) => {
				const j = cleanupJobs.get(id);
				return j ? structuredClone(j) : undefined;
			},
			delete: async (id: string) => {
				cleanupJobs.delete(id);
			},
			toArray: async () => [...cleanupJobs.values()].map((j) => structuredClone(j))
		},
		suggestedRegions: {
			delete: async (id: string) => {
				suggestedRegions.delete(id);
			}
		},
		transaction: async (_mode: string, ...args: unknown[]) => {
			const fn = args[args.length - 1] as () => Promise<void>;
			await fn();
		}
	})
}));

vi.mock('$lib/persistence/opfs', () => ({
	deletePath: vi.fn(async () => undefined)
}));

import { discardTake, listTakesForSession } from './takes';
import { enqueueCleanup, processDueCleanups } from './cleanup';
import { deletePath } from './opfs';

function seedSavedTake() {
	takes.clear();
	sessions.clear();
	cleanupJobs.clear();
	suggestedRegions.clear();

	const session = createSession('Field');
	const draft = createTake({
		session,
		sequence: 1,
		source: {
			fileRef: '',
			mimeType: 'audio/webm',
			byteLength: 1024,
			durationSeconds: 1.5,
			sourceType: 'recording'
		}
	});
	const take: Take = {
		...draft,
		lifecycleState: 'saved',
		source: {
			...draft.source,
			fileRef: sourcePath(session.id, draft.id)
		}
	};
	session.takeOrder = [take.id];
	sessions.set(session.id, session);
	takes.set(take.id, take);
	return { session, take };
}

/** Parent + N collected children sharing the same OPFS source. */
function seedParentWithChildren(childCount: number) {
	const { session, take: parent } = seedSavedTake();
	const sharedRef = parent.source.fileRef;
	const children: Take[] = [];

	for (let i = 0; i < childCount; i += 1) {
		const draft = createTake({
			session,
			sequence: 2 + i,
			source: { ...parent.source }
		});
		const child: Take = {
			...draft,
			lifecycleState: 'saved',
			derivedFromTakeId: parent.id,
			source: { ...parent.source, fileRef: sharedRef }
		};
		children.push(child);
		takes.set(child.id, child);
	}

	session.takeOrder = [parent.id, ...children.map((c) => c.id)];
	sessions.set(session.id, session);
	return { session, parent, children, sharedRef };
}

function jobsHolding(ref: string): CleanupJob[] {
	return [...cleanupJobs.values()].filter((job) => job.fileRefs.includes(ref));
}

describe('discard + cleanup', () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.mocked(deletePath).mockClear();
		vi.mocked(deletePath).mockImplementation(async () => undefined);
	});

	it('removes discarded takes from the session immediately', async () => {
		const { session, take } = seedSavedTake();

		const result = await discardTake(take.id);
		expect(result.lifecycleState).toBe('deleted');
		expect(await listTakesForSession(session.id)).toHaveLength(0);
	});

	it('deletes binaries when cleanup is due', async () => {
		const { take } = seedSavedTake();

		await discardTake(take.id);
		const processed = await processDueCleanups(Date.now());
		expect(processed.processed).toBe(1);
		expect(deletePath).toHaveBeenCalledWith(take.source.fileRef);
	});

	it('keeps a shared Extract source while another take still references it', async () => {
		const { parent, children, sharedRef } = seedParentWithChildren(1);
		const extract = children[0]!;

		const discarded = await discardTake(extract.id);
		expect(jobsHolding(sharedRef)).toHaveLength(0);
		expect(discarded.lifecycleState).toBe('deleted');

		await processDueCleanups(Date.now());
		expect(deletePath).not.toHaveBeenCalledWith(sharedRef);

		await discardTake(parent.id);
		await processDueCleanups(Date.now());
		expect(deletePath).toHaveBeenCalledWith(sharedRef);
	});

	it('keeps shared source when parent is discarded first while children remain', async () => {
		const { session, parent, children, sharedRef } = seedParentWithChildren(2);

		await discardTake(parent.id);
		expect(jobsHolding(sharedRef)).toHaveLength(0);
		await processDueCleanups(Date.now());
		expect(deletePath).not.toHaveBeenCalledWith(sharedRef);
		expect(await listTakesForSession(session.id)).toHaveLength(2);

		await discardTake(children[0]!.id);
		expect(jobsHolding(sharedRef)).toHaveLength(0);
		await processDueCleanups(Date.now());
		expect(deletePath).not.toHaveBeenCalledWith(sharedRef);

		await discardTake(children[1]!.id);
		expect(jobsHolding(sharedRef).length).toBeGreaterThan(0);
		await processDueCleanups(Date.now());
		expect(deletePath).toHaveBeenCalledWith(sharedRef);
	});

	it('keeps shared source across two children until the last one is discarded', async () => {
		const { children, sharedRef } = seedParentWithChildren(2);
		// Parent still present; discard both children one by one — source stays for parent.
		await discardTake(children[0]!.id);
		await discardTake(children[1]!.id);
		expect(jobsHolding(sharedRef)).toHaveLength(0);
		await processDueCleanups(Date.now());
		expect(deletePath).not.toHaveBeenCalledWith(sharedRef);
	});

	it('deletes shared source after batch discard of parent and all children', async () => {
		const { parent, children, sharedRef } = seedParentWithChildren(2);

		await discardTake(parent.id);
		await discardTake(children[0]!.id);
		await discardTake(children[1]!.id);

		expect(jobsHolding(sharedRef).length).toBeGreaterThan(0);
		await processDueCleanups(Date.now());
		expect(deletePath).toHaveBeenCalledWith(sharedRef);
	});

	it('deletes shared source when batch order is children-then-parent', async () => {
		const { parent, children, sharedRef } = seedParentWithChildren(2);

		await discardTake(children[0]!.id);
		await discardTake(children[1]!.id);
		await discardTake(parent.id);

		expect(jobsHolding(sharedRef).length).toBeGreaterThan(0);
		await processDueCleanups(Date.now());
		expect(deletePath).toHaveBeenCalledWith(sharedRef);
	});

	it('does not enqueue an empty cleanup job when every ref is still held', async () => {
		const { parent, children, sharedRef } = seedParentWithChildren(1);

		await discardTake(children[0]!.id);
		expect(cleanupJobs.size).toBe(0);
		expect(jobsHolding(sharedRef)).toHaveLength(0);

		// Parent-only unique assets would still enqueue; parent shares only source here.
		await discardTake(parent.id);
		expect(jobsHolding(sharedRef).length).toBeGreaterThan(0);
	});

	it('keeps failed cleanup jobs retryable and succeeds on a later pass', async () => {
		const { take } = seedSavedTake();
		await discardTake(take.id);

		vi.mocked(deletePath).mockRejectedValueOnce(new Error('OPFS busy'));
		const first = await processDueCleanups(Date.now());
		expect(first.failed).toBe(1);
		expect(first.processed).toBe(0);
		expect(cleanupJobs.size).toBe(1);
		const stuck = [...cleanupJobs.values()][0]!;
		expect(stuck.attempts).toBe(1);
		expect(stuck.lastError?.code).toBe('CLEANUP_FAILED');
		expect(stuck.lastError?.recoverable).toBe(true);

		vi.mocked(deletePath).mockImplementation(async () => undefined);
		const second = await processDueCleanups(Date.now());
		expect(second.processed).toBe(1);
		expect(second.failed).toBe(0);
		expect(cleanupJobs.size).toBe(0);
		expect(deletePath).toHaveBeenCalledWith(take.source.fileRef);
	});

	it('enqueueCleanup returns null for empty refs', async () => {
		const job = await enqueueCleanup([], new Date().toISOString());
		expect(job).toBeNull();
		expect(cleanupJobs.size).toBe(0);
	});
});
