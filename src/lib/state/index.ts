import {
	captureController,
	formatDuration,
	getCaptureSnapshot,
	persistSessionName
} from './capture';
import { audiotoolAuth, connect, disconnect, hydrateAudiotoolAuth } from './audiotool-auth.svelte';
import { actionToast, getActionToastSnapshot } from './action-toast';
import {
	batchSaveTakeMetadata,
	collectSelectionAsLocalFile,
	discardLocalFile,
	discardLocalFiles,
	extractSelectionAsLocalFile,
	notifyTakeInventoryChanged,
	onTakeInventoryChanged,
	renameTakeDisplayName,
	runDeferredCleanup,
	saveTakeEditRecipe,
	saveTakeMetadata,
	saveTakeOutput
} from './take-actions';
import { importAudioFile, importAudioFiles } from './import-take';
import { closeAccountOverlay, isAccountOverlayOpen, openAccountOverlay } from './account-overlay';
import {
	cancelTakeUpload,
	enqueueBatchTakeUploads,
	enqueueTakeUpload,
	getUploadJobSnapshot,
	hydrateUploadQueue,
	onUploadQueueChanged,
	retryTakeUpload,
	uploadQueue
} from './upload-queue.svelte';

export { captureController, formatDuration, getCaptureSnapshot, persistSessionName };
export type { CaptureStore, CaptureUiPhase } from './capture';
export { audiotoolAuth, connect, disconnect, hydrateAudiotoolAuth };
export { actionToast, getActionToastSnapshot };
export type { ActionToastEntry, ActionToastShowOptions } from './action-toast';
export {
	batchSaveTakeMetadata,
	collectSelectionAsLocalFile,
	discardLocalFile,
	discardLocalFiles,
	extractSelectionAsLocalFile,
	notifyTakeInventoryChanged,
	onTakeInventoryChanged,
	renameTakeDisplayName,
	runDeferredCleanup,
	saveTakeEditRecipe,
	saveTakeMetadata,
	saveTakeOutput
};
export { importAudioFile, importAudioFiles };
export type { ImportAudioFilesResult } from './import-take';
export { closeAccountOverlay, isAccountOverlayOpen, openAccountOverlay };
export {
	cancelTakeUpload,
	enqueueBatchTakeUploads,
	enqueueTakeUpload,
	getUploadJobSnapshot,
	hydrateUploadQueue,
	onUploadQueueChanged,
	retryTakeUpload,
	uploadQueue
};
export {
	isGeneratingTagsForTake,
	onGeneratedTagsApplied,
	onGeneratedTagsStateChange,
	scheduleGeneratedTagsForTake,
	scheduleGeneratedTagsForTakes
} from './generated-tags';
