import type { SessionId, TakeId } from '$lib/domain/types';

export const SCHEMA_VERSION = 1;

export function sessionDir(sessionId: SessionId): string {
	return `sessions/${sessionId}`;
}

export function takeDir(sessionId: SessionId, takeId: TakeId): string {
	return `${sessionDir(sessionId)}/takes/${takeId}`;
}

export function sourcePath(sessionId: SessionId, takeId: TakeId): string {
	return `${takeDir(sessionId, takeId)}/source.bin`;
}

export function peaksPath(sessionId: SessionId, takeId: TakeId): string {
	return `${takeDir(sessionId, takeId)}/peaks-v1.bin`;
}

export function renderedWavPath(sessionId: SessionId, takeId: TakeId, hash: string): string {
	return `${takeDir(sessionId, takeId)}/rendered-${hash}.wav`;
}

export function renderedMp3Path(sessionId: SessionId, takeId: TakeId, hash: string): string {
	return `${takeDir(sessionId, takeId)}/rendered-${hash}.mp3`;
}

export function trashPath(cleanupId: string, fileName: string): string {
	return `trash/${cleanupId}/${fileName}`;
}
