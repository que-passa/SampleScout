import { clearAllMetadata, getDatabase, runMigrations } from './db';
import { clearAllBinaries, probeOpfsWritable, writeBinary } from './opfs';
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
	renameSession,
	applyActiveSessionName
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
	countCollectionFiles,
	countPendingFileTakes,
	listDisplayNamesForSession,
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
import {
	getAppSettings,
	putAppSettings,
	putCapturePreferences,
	putRecentTags,
	putSessionNamePresets,
	rememberRecentTagsFromUse
} from './settings';
import {
	deleteSuggestedRegions,
	getSuggestedRegions,
	isSuggestedRegionsCacheFresh,
	putSuggestedRegions,
	saveSuggestedRegionsForTake,
	suggestedRegionsSourceFingerprint
} from './suggested-regions';

export {
	clearAllMetadata,
	getDatabase,
	runMigrations,
	clearAllBinaries,
	probeOpfsWritable,
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
	applyActiveSessionName,
	checkStorageForImport,
	checkStorageForRecording,
	estimateMaxRecordingBytes,
	commitSavedTake,
	discardTake,
	extractTakeFromSelection,
	formatTakeLabel,
	getTake,
	listSavedTakesNewestFirst,
	countCollectionFiles,
	countPendingFileTakes,
	listDisplayNamesForSession,
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
	updateUploadJob,
	getAppSettings,
	putAppSettings,
	putCapturePreferences,
	putRecentTags,
	putSessionNamePresets,
	rememberRecentTagsFromUse,
	deleteSuggestedRegions,
	getSuggestedRegions,
	isSuggestedRegionsCacheFresh,
	putSuggestedRegions,
	saveSuggestedRegionsForTake,
	suggestedRegionsSourceFingerprint
};

export async function deleteAllLocalData(): Promise<void> {
	await clearAllMetadata();
	try {
		await clearAllBinaries();
	} catch {
		// OPFS may be unavailable; metadata clear still proceeds.
	}
}
