import Dexie, { type EntityTable } from 'dexie';
import type { SuggestedRegionsRecord } from '$lib/domain/suggested-regions';
import type { AppSettings, CaptureSession, CleanupJob, Take, UploadJob } from '$lib/domain/types';
import { SCHEMA_VERSION } from './paths';

export class SampleScoutDatabase extends Dexie {
	sessions!: EntityTable<CaptureSession, 'id'>;
	takes!: EntityTable<Take, 'id'>;
	uploadJobs!: EntityTable<UploadJob, 'id'>;
	cleanupJobs!: EntityTable<CleanupJob, 'id'>;
	settings!: EntityTable<AppSettings, 'id'>;
	suggestedRegions!: EntityTable<SuggestedRegionsRecord, 'takeId'>;

	constructor() {
		super('samplescout');

		this.version(1).stores({
			sessions: 'id, status, updatedAt',
			takes: 'id, sessionId, sequence, lifecycleState, updatedAt',
			uploadJobs: 'id, takeId, state, updatedAt',
			cleanupJobs: 'id, deleteAfter',
			settings: 'id'
		});

		this.version(SCHEMA_VERSION).stores({
			suggestedRegions: 'takeId, updatedAt'
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
		db.settings.clear(),
		db.suggestedRegions.clear()
	]);
}

/**
 * Migration hook for future schema bumps.
 * Keep migrations additive and idempotent.
 */
export async function runMigrations(): Promise<void> {
	getDatabase();
}
