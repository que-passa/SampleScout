import { createSession } from '$lib/domain/metadata';
import { formatFieldSessionName } from '$lib/domain/catalog';
import { nowIso } from '$lib/domain/ids';
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
		name: name.trim() || session.name,
		updatedAt: nowIso()
	};
	await putSession(updated);
	return updated;
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
