import { clearAllMetadata, getDatabase, runMigrations } from './db';
import { clearAllBinaries, writeBinary } from './opfs';
import {
	peaksPath,
	renderedMp3Path,
	renderedWavPath,
	SCHEMA_VERSION,
	sessionDir,
	sourcePath,
	takeDir,
	trashPath
} from './paths';
import {
	appendTakeToSession,
	ensureActiveSession,
	getActiveSession,
	getSession,
	listSessions,
	putSession,
	removeTakeFromSession,
	renameSession
} from './sessions';
import {
	checkStorageForImport,
	checkStorageForRecording,
	estimateMaxRecordingBytes
} from './storage-gate';
import {
	commitSavedTake,
	discardTake,
	extractTakeFromSelection,
	formatTakeLabel,
	getTake,
	listSavedTakesNewestFirst,
	countPendingDraftTakes,
	listTakesForSession,
	nextSequenceForSession,
	putTake,
	renameTake,
	updateTake,
	updateTakeEditRecipe,
	updateTakeMetadata,
	updateTakeOutput
} from './takes';
import {
	deleteCleanupJob,
	enqueueCleanup,
	filterUnheldFileRefs,
	getCleanupJob,
	isFileRefStillHeld,
	listCleanupJobs,
	processDueCleanups,
	putCleanupJob,
	takeHoldsFileRef
} from './cleanup';
import {
	createUploadJob,
	deleteUploadJobsForTake,
	getUploadJob,
	getUploadJobForTake,
	listActiveUploadJobs,
	listInFlightUploadJobs,
	listQueuedUploadJobs,
	listUploadJobs,
	patchUploadJob,
	putUploadJob,
	setUploadJobState,
	updateUploadJob
} from './upload-jobs';

export {
	clearAllMetadata,
	getDatabase,
	runMigrations,
	clearAllBinaries,
	writeBinary,
	peaksPath,
	renderedMp3Path,
	renderedWavPath,
	SCHEMA_VERSION,
	sessionDir,
	sourcePath,
	takeDir,
	trashPath,
	appendTakeToSession,
	ensureActiveSession,
	getActiveSession,
	getSession,
	listSessions,
	putSession,
	removeTakeFromSession,
	renameSession,
	checkStorageForImport,
	checkStorageForRecording,
	estimateMaxRecordingBytes,
	commitSavedTake,
	discardTake,
	extractTakeFromSelection,
	formatTakeLabel,
	getTake,
	listSavedTakesNewestFirst,
	countPendingDraftTakes,
	listTakesForSession,
	nextSequenceForSession,
	putTake,
	renameTake,
	updateTake,
	updateTakeEditRecipe,
	updateTakeMetadata,
	updateTakeOutput,
	deleteCleanupJob,
	enqueueCleanup,
	filterUnheldFileRefs,
	getCleanupJob,
	isFileRefStillHeld,
	listCleanupJobs,
	processDueCleanups,
	putCleanupJob,
	takeHoldsFileRef,
	createUploadJob,
	deleteUploadJobsForTake,
	getUploadJob,
	getUploadJobForTake,
	listActiveUploadJobs,
	listInFlightUploadJobs,
	listQueuedUploadJobs,
	listUploadJobs,
	patchUploadJob,
	putUploadJob,
	setUploadJobState,
	updateUploadJob
};

export async function deleteAllLocalData(): Promise<void> {
	await clearAllMetadata();
	try {
		await clearAllBinaries();
	} catch {
		// OPFS may be unavailable; metadata clear still proceeds.
	}
}
