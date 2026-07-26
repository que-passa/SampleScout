import Dexie, { type EntityTable } from 'dexie';
import type { AppSettings, CaptureSession, CleanupJob, Take, UploadJob } from '$lib/domain/types';
import { SCHEMA_VERSION } from './paths';

export class SampleScoutDatabase extends Dexie {
	sessions!: EntityTable<CaptureSession, 'id'>;
	takes!: EntityTable<Take, 'id'>;
	uploadJobs!: EntityTable<UploadJob, 'id'>;
	cleanupJobs!: EntityTable<CleanupJob, 'id'>;
	settings!: EntityTable<AppSettings, 'id'>;

	constructor() {
		super('samplescout');

		this.version(SCHEMA_VERSION).stores({
			sessions: 'id, status, updatedAt',
			takes: 'id, sessionId, sequence, lifecycleState, updatedAt',
			uploadJobs: 'id, takeId, state, updatedAt',
			cleanupJobs: 'id, deleteAfter',
			settings: 'id'
		});
	}
}

let dbInstance: SampleScoutDatabase | undefined;

export function getDatabase(): SampleScoutDatabase {
	if (!dbInstance) {
		dbInstance = new SampleScoutDatabase();
	}
	return dbInstance;
}

export async function clearAllMetadata(): Promise<void> {
	const db = getDatabase();
	await Promise.all([
		db.sessions.clear(),
		db.takes.clear(),
		db.uploadJobs.clear(),
		db.cleanupJobs.clear(),
		db.settings.clear()
	]);
}

/**
 * Migration hook for future schema bumps.
 * Keep migrations additive and idempotent.
 */
export async function runMigrations(): Promise<void> {
	getDatabase();
}
