export type SessionId = string;
export type TakeId = string;
export type UploadJobId = string;
export type FileRef = string;

export type SampleKind = 'one-shot' | 'loop';
export type Visibility = 'unlisted' | 'public';

export type MetadataOrigin =
	'application-default' | 'user-preference' | 'session-default' | 'generated' | 'manual';

export type TakeLifecycleState =
	'recording' | 'finalizing' | 'saved' | 'pending-delete' | 'deleted';

export type TakeReviewState = 'unreviewed' | 'edited' | 'ready';

export type TakeUploadState =
	| 'not-queued'
	| 'queued'
	| 'rendering'
	| 'encoding'
	| 'uploading'
	| 'processing'
	| 'uploaded'
	| 'failed';

export type UploadJobState =
	| 'queued'
	| 'rendering'
	| 'encoding'
	| 'uploading'
	| 'processing'
	| 'completed'
	| 'failed'
	| 'canceled';

export type RecordingChannelMode = 'device' | 'mono' | 'stereo';
export type RecordingSampleRate = 'device' | 44100 | 48000;
export type RecordingEncoderBitrate = 'device' | 96 | 128 | 192;

export interface RecordingSettings {
	channelMode: RecordingChannelMode;
	sampleRate: RecordingSampleRate;
	encoderBitrateKbps: RecordingEncoderBitrate;
}

export type OutputSettings =
	| {
			format: 'wav';
			bitDepth: 16 | 24;
	  }
	| {
			format: 'mp3';
			bitrateKbps: 96 | 128 | 192;
	  }
	| {
			format: 'source';
	  };

export interface AppError {
	code: string;
	message: string;
	recoverable: boolean;
	cause?: unknown;
	context?: Record<string, string | number | boolean>;
	occurredAt: string;
}

export interface SessionDefaults {
	tags: string[];
	descriptionTemplate: string;
	kind: SampleKind;
	visibility: Visibility;
	output: OutputSettings;
	bpm?: number;
}

export interface CaptureSession {
	id: SessionId;
	name: string;
	createdAt: string;
	updatedAt: string;
	status: 'active' | 'inactive' | 'archived';
	defaults: SessionDefaults;
	takeOrder: TakeId[];
}

export interface AudioSource {
	fileRef: FileRef;
	mimeType: string;
	byteLength: number;
	durationSeconds: number;
	channelCount?: number;
	sampleRate?: number;
	recorderMimeType?: string;
	sourceType: 'recording' | 'import';
	originalFileName?: string;
}

export interface TakeMetadata {
	displayName: string;
	description: string;
	tags: string[];
	kind: SampleKind;
	visibility: Visibility;
	bpm?: number;
	provenance: {
		displayName: MetadataOrigin;
		description: MetadataOrigin;
		tags: MetadataOrigin;
		/** Tags from the last auto-generation run — used for per-tag styling after manual edits. */
		generatedTagSnapshot?: string[];
		/** Set when tags were last auto-generated; used to refresh stale classifications. */
		tagsAlgorithmVersion?: number;
		kind: MetadataOrigin;
		visibility: MetadataOrigin;
		bpm?: MetadataOrigin;
	};
}

export interface RetainedSegment {
	id: string;
	sourceStartSeconds: number;
	sourceEndSeconds: number;
	fadeInSeconds: number;
	fadeOutSeconds: number;
	gainDb: number;
}

/** High-pass rumble-cut presets (Hz). `0` = off. */
export type HighPassHz = 0 | 40 | 80 | 120 | 240 | 480;

export interface EditRecipeProcessing {
	highPassHz: HighPassHz;
	softLimitEnabled: boolean;
	gateEnabled: boolean;
	/** Gate opens above this level (dBFS). */
	gateThresholdDbfs: number;
}

export interface EditRecipe {
	version: 1;
	segments: RetainedSegment[];
	peakNormalization?: {
		enabled: boolean;
		targetDbfs: number;
		calculatedGainDb?: number;
	};
	/** Take-level cleanup after trim/concat (non-destructive on source). */
	processing?: EditRecipeProcessing;
}

export interface PeakAsset {
	version: 1;
	fileRef: FileRef;
	channels: number;
	framesPerPeak: number;
	peakCount: number;
	generatedAt: string;
}

export interface RenderedAsset {
	fileRef: FileRef;
	mimeType: string;
	byteLength: number;
	hash: string;
	createdAt: string;
}

export interface Take {
	id: TakeId;
	sessionId: SessionId;
	sequence: number;
	createdAt: string;
	updatedAt: string;
	source: AudioSource;
	metadata: TakeMetadata;
	editRecipe: EditRecipe;
	output: OutputSettings;
	/** Set when this Local File was Extracted from another take’s selection. */
	derivedFromTakeId?: TakeId;
	lifecycleState: TakeLifecycleState;
	reviewState: TakeReviewState;
	uploadState: TakeUploadState;
	peaks?: PeakAsset;
	renderedAsset?: RenderedAsset;
	lastError?: AppError;
}

export interface UploadJob {
	id: UploadJobId;
	takeId: TakeId;
	createdAt: string;
	updatedAt: string;
	state: UploadJobState;
	attempt: number;
	renderedFileRef?: FileRef;
	renderedByteLength?: number;
	audiotoolSampleName?: string;
	uploadedAt?: string;
	readyAt?: string;
	progress?: {
		phase: 'rendering' | 'encoding' | 'uploading' | 'processing';
		fraction?: number;
	};
	error?: AppError;
}

export interface CleanupJob {
	id: string;
	fileRefs: FileRef[];
	createdAt: string;
	deleteAfter: string;
	attempts: number;
	lastError?: AppError;
}

export interface AppSettings {
	id: 'settings';
	recentTags: string[];
	preferredOutput: OutputSettings;
	/** Capture MediaRecorder requests; device may ignore. */
	recordingSettings: RecordingSettings;
	/** Custom Field Session titles for Capture name sheet (newest first, max 12). */
	sessionNamePresets: string[];
	updatedAt: string;
}
