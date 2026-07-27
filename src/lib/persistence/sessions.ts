import { createSession } from '$lib/domain/metadata';
import { formatFieldSessionName } from '$lib/domain/catalog';
import { nowIso } from '$lib/domain/ids';
import { normalizeSessionName } from '$lib/domain/session-name';
import type { CaptureSession, SessionId, TakeId } from '$lib/domain/types';
import { cloneForIdb } from './clone-for-idb';
import { getDatabase } from './db';

export async function putSession(session: CaptureSession): Promise<void> {
	await getDatabase().sessions.put(cloneForIdb(session));
}

export async function getSession(id: SessionId): Promise<CaptureSession | undefined> {
	return getDatabase().sessions.get(id);
}

export async function listSessions(): Promise<CaptureSession[]> {
	const sessions = await getDatabase().sessions.orderBy('updatedAt').reverse().toArray();
	return sessions;
}

export async function getActiveSession(): Promise<CaptureSession | undefined> {
	const actives = await getDatabase().sessions.where('status').equals('active').toArray();
	if (actives.length === 0) return undefined;
	actives.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	return actives[0];
}

export async function ensureActiveSession(
	name = formatFieldSessionName()
): Promise<CaptureSession> {
	const existing = await getActiveSession();
	if (existing) return existing;

	const session = createSession(name);
	await putSession(session);
	return session;
}

export async function renameSession(
	id: SessionId,
	name: string
): Promise<CaptureSession | undefined> {
	const session = await getSession(id);
	if (!session) return undefined;

	const updated: CaptureSession = {
		...session,
		name: normalizeSessionName(name),
		updatedAt: nowIso()
	};
	await putSession(updated);
	return updated;
}

/** True when the session has at least one saved Local File. */
async function sessionHasSavedTakes(sessionId: SessionId): Promise<boolean> {
	const takes = await getDatabase().takes.where('sessionId').equals(sessionId).toArray();
	return takes.some((take) => take.lifecycleState === 'saved');
}

/**
 * Apply a Field Session title from Capture.
 * - Same name → no-op (returns active).
 * - Active session has saved files → seal it (`inactive`) and create a new active session
 *   with the new name so Collection keeps the previous group.
 * - Empty active session → rename in place.
 */
export async function applyActiveSessionName(name: string): Promise<CaptureSession> {
	const normalized = normalizeSessionName(name);
	const active = await getActiveSession();

	if (!active) {
		const session = createSession(normalized);
		await putSession(session);
		return session;
	}

	if (active.name === normalized) {
		return active;
	}

	if (!(await sessionHasSavedTakes(active.id))) {
		const renamed = await renameSession(active.id, normalized);
		return renamed ?? active;
	}

	const sealed: CaptureSession = {
		...active,
		status: 'inactive',
		updatedAt: nowIso()
	};
	await putSession(sealed);

	const next = createSession(normalized);
	await putSession(next);
	return next;
}

export async function appendTakeToSession(
	sessionId: SessionId,
	takeId: TakeId
): Promise<CaptureSession | undefined> {
	const session = await getSession(sessionId);
	if (!session) return undefined;

	if (session.takeOrder.includes(takeId)) return session;

	const updated: CaptureSession = {
		...session,
		takeOrder: [...session.takeOrder, takeId],
		updatedAt: nowIso()
	};
	await putSession(updated);
	return updated;
}

export async function removeTakeFromSession(
	sessionId: SessionId,
	takeId: TakeId
): Promise<CaptureSession | undefined> {
	const session = await getSession(sessionId);
	if (!session) return undefined;

	if (!session.takeOrder.includes(takeId)) return session;

	const updated: CaptureSession = {
		...session,
		takeOrder: session.takeOrder.filter((id) => id !== takeId),
		updatedAt: nowIso()
	};
	await putSession(updated);
	return updated;
}
