import { describe, expect, it, vi, afterEach } from 'vitest';
import { createSession, createTakeDraft } from '$lib/domain/metadata';
import type { CleanupJob, CaptureSession, Take } from '$lib/domain/types';
import { sourcePath } from '$lib/persistence/paths';

const takes = new Map<string, Take>();
const sessions = new Map<string, CaptureSession>();
const cleanupJobs = new Map<string, CleanupJob>();

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
import { processDueCleanups } from './cleanup';
import { deletePath } from './opfs';

function seedSavedTake() {
	takes.clear();
	sessions.clear();
	cleanupJobs.clear();

	const session = createSession('Field');
	const draft = createTakeDraft({
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

describe('discard + cleanup', () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.mocked(deletePath).mockClear();
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
		const { session, take: parent } = seedSavedTake();
		const sharedRef = parent.source.fileRef;

		const extractDraft = createTakeDraft({
			session,
			sequence: 2,
			source: { ...parent.source }
		});
		const extract: Take = {
			...extractDraft,
			lifecycleState: 'saved',
			derivedFromTakeId: parent.id,
			source: { ...parent.source, fileRef: sharedRef }
		};
		session.takeOrder = [parent.id, extract.id];
		sessions.set(session.id, session);
		takes.set(extract.id, extract);

		const discarded = await discardTake(extract.id);
		expect(
			[...cleanupJobs.values()].some((job) => job.fileRefs.includes(sharedRef))
		).toBe(false);
		expect(discarded.lifecycleState).toBe('deleted');

		await processDueCleanups(Date.now());
		expect(deletePath).not.toHaveBeenCalledWith(sharedRef);

		await discardTake(parent.id);
		await processDueCleanups(Date.now());
		expect(deletePath).toHaveBeenCalledWith(sharedRef);
	});
});
