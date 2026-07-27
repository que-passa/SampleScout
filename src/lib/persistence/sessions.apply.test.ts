import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createSession, createTake } from '$lib/domain/metadata';
import type { CaptureSession, Take } from '$lib/domain/types';
import { sourcePath } from '$lib/persistence/paths';

const takes = new Map<string, Take>();
const sessions = new Map<string, CaptureSession>();

vi.mock('$lib/persistence/db', () => ({
	getDatabase: () => ({
		takes: {
			where: () => ({
				equals: (sessionId: string) => ({
					toArray: async () =>
						[...takes.values()]
							.filter((t) => t.sessionId === sessionId)
							.map((t) => structuredClone(t))
				})
			})
		},
		sessions: {
			get: async (id: string) => {
				const s = sessions.get(id);
				return s ? structuredClone(s) : undefined;
			},
			put: async (session: CaptureSession) => {
				sessions.set(session.id, structuredClone(session));
			},
			where: () => ({
				equals: (status: string) => ({
					toArray: async () =>
						[...sessions.values()].filter((s) => s.status === status).map((s) => structuredClone(s))
				})
			})
		}
	})
}));

const { applyActiveSessionName, putSession } = await import('./sessions');

describe('applyActiveSessionName', () => {
	beforeEach(() => {
		takes.clear();
		sessions.clear();
	});

	it('renames an empty active session in place', async () => {
		const session = createSession('Session');
		await putSession(session);

		const next = await applyActiveSessionName('Forest');
		expect(next.id).toBe(session.id);
		expect(next.name).toBe('Forest');
		expect(next.status).toBe('active');
		expect(sessions.size).toBe(1);
	});

	it('seals a session with saved files and starts a new active session', async () => {
		const session = createSession('Rain');
		await putSession(session);
		const draft = createTake({
			session,
			sequence: 1,
			source: {
				fileRef: sourcePath(session.id, 'take-1'),
				mimeType: 'audio/webm',
				byteLength: 100,
				durationSeconds: 1,
				sourceType: 'recording'
			}
		});
		const saved: Take = { ...draft, lifecycleState: 'saved' };
		takes.set(saved.id, saved);

		const next = await applyActiveSessionName('Forest');
		expect(next.id).not.toBe(session.id);
		expect(next.name).toBe('Forest');
		expect(next.status).toBe('active');

		const sealed = sessions.get(session.id);
		expect(sealed?.status).toBe('inactive');
		expect(sealed?.name).toBe('Rain');
		expect(sessions.size).toBe(2);
	});

	it('is a no-op when the name is unchanged', async () => {
		const session = createSession('Forest');
		await putSession(session);
		const next = await applyActiveSessionName('Forest');
		expect(next.id).toBe(session.id);
		expect(sessions.size).toBe(1);
	});
});
