# Data Model and States

## 1. Identifiers

Use opaque UUIDs generated locally.

```ts
type SessionId = string;
type TakeId = string;
type UploadJobId = string;
type FileRef = string;
```

Do not use array indexes as identifiers.

## Product vocabulary mapping

- `CaptureSession` / `Session` remains the persisted and engineering term; the UI label is **Field Session**.
- `Take` remains the record term; saved takes are browsed in **Collection** at `/collection`.
- **Field Notes** is the UI label for the existing `TakeMetadata` / details surface. Do not add a `notes` field.
- **Local File** maps to an existing take with `lifecycleState === 'saved'` after the OPFS + IndexedDB commit gate. It is not a new enum value and means this device only.
- **Collect** creates another `Take` from the current retained trim; it is not a separate entity type. Optional `derivedFromTakeId` records lineage for UI honesty.
- A specimen mark is derived deterministically at presentation time from persisted take/source facts (pattern + neon fill index). It is not persisted audio analysis, an audio fingerprint, a quality score, or random decoration.

## 2. Session model

```ts
interface CaptureSession {
	id: SessionId;
	name: string;
	createdAt: string;
	updatedAt: string;
	status: 'active' | 'inactive' | 'archived';

	defaults: SessionDefaults;
	takeOrder: TakeId[];
}
```

Default `name` for a new session is **`Session`**. Capture renames via a sheet (built-in location/activity presets + up to 12 remembered custom names on `AppSettings.sessionNamePresets`). Applying a **different** name when the active session already has saved Local Files seals that session (`status: 'inactive'`) and creates a new active session — Collection keeps both groups. Empty sessions rename in place. Changing the title never rewrites existing take display names.

```ts
interface SessionDefaults {
	tags: string[];
	descriptionTemplate: string;
	kind: 'one-shot' | 'loop';
	visibility: 'unlisted' | 'public';
	output: OutputSettings;
	bpm?: number;
}
```

## 3. Take model

```ts
interface Take {
	id: TakeId;
	sessionId: SessionId;
	sequence: number;

	createdAt: string;
	updatedAt: string;

	source: AudioSource;
	metadata: TakeMetadata;
	editRecipe: EditRecipe;
	output: OutputSettings;

	/** Present when this take was Collected from another take’s retained trim. */
	derivedFromTakeId?: TakeId;

	lifecycleState: TakeLifecycleState;
	reviewState: TakeReviewState;
	uploadState: TakeUploadState;

	peaks?: PeakAsset;
	renderedAsset?: RenderedAsset;
	lastError?: AppError;
}
```

Collected takes normally reuse the parent `source.fileRef` (reference-counted cleanup). They do not require a duplicated OPFS binary for MVP.

**Display names:** generated as short stem + space + two-digit number (`Rain 01`). Never use em/en dashes. Numbering continues while the stem matches the previous numbered name in the session; resets to `01` when the stem changes.

**Upload pending:** a take is upload-pending when it is a saved Local File, `uploadState !== 'uploaded'`, and no other take has `derivedFromTakeId === this.id`. Parents with collected children are source-only for default Collection Upload.

## 4. Audio source

```ts
interface AudioSource {
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
```

## 5. Metadata

```ts
interface TakeMetadata {
	displayName: string;
	description: string;
	tags: string[];
	kind: 'one-shot' | 'loop';
	visibility: 'unlisted' | 'public';
	bpm?: number;

	provenance: {
		displayName: MetadataOrigin;
		description: MetadataOrigin;
		tags: MetadataOrigin;
		kind: MetadataOrigin;
		visibility: MetadataOrigin;
		bpm?: MetadataOrigin;
	};
}
```

```ts
type MetadataOrigin =
	'application-default' | 'user-preference' | 'session-default' | 'generated' | 'manual';
```

## 6. Output settings

```ts
type OutputSettings =
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
```

`source` is permitted only when:

- The source format is accepted by Audiotool.
- No audio edit requires rendering.
- No conversion/downmix is requested.

## 7. Edit recipe

```ts
interface EditRecipe {
	version: 1;
	segments: RetainedSegment[];
	peakNormalization?: {
		enabled: boolean;
		targetDbfs: number;
		calculatedGainDb?: number;
	};
}
```

```ts
interface RetainedSegment {
	id: string;
	sourceStartSeconds: number;
	sourceEndSeconds: number;
	fadeInSeconds: number;
	fadeOutSeconds: number;
	gainDb: number;
}
```

Initial recipe:

```ts
{
  version: 1,
  segments: [{
    id: crypto.randomUUID(),
    sourceStartSeconds: 0,
    sourceEndSeconds: source.durationSeconds,
    fadeInSeconds: 0,
    fadeOutSeconds: 0,
    gainDb: 0
  }]
}
```

## 8. Peak asset

```ts
interface PeakAsset {
	version: 1;
	fileRef: FileRef;
	channels: number;
	framesPerPeak: number;
	peakCount: number;
	generatedAt: string;
}
```

Store binary min/max values rather than large JSON arrays.

## 9. Upload job

```ts
interface UploadJob {
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
```

## 10. State types

```ts
type TakeLifecycleState = 'recording' | 'finalizing' | 'saved' | 'pending-delete' | 'deleted';

type TakeReviewState = 'unreviewed' | 'edited' | 'ready';

type TakeUploadState =
	| 'not-queued'
	| 'queued'
	| 'rendering'
	| 'encoding'
	| 'uploading'
	| 'processing'
	| 'uploaded'
	| 'failed';

type UploadJobState =
	| 'queued'
	| 'rendering'
	| 'encoding'
	| 'uploading'
	| 'processing'
	| 'completed'
	| 'failed'
	| 'canceled';
```

## 11. Capture state machine

```text
idle
→ requesting-permission
→ preparing
→ recording
→ stopping
→ finalizing
→ saved
→ idle
```

Failure branches:

```text
requesting-permission → permission-denied
preparing → capture-error
recording → interrupted
stopping/finalizing → save-error
```

No transition to `saved` is allowed before persistence succeeds.

## 12. Retake (not supported)

In-place retake / source replacement is not a product feature. Capture a new take instead.

## 13. Discard state machine

```text
visible (saved)
→ deleted + cleanup scheduled
→ binaries removed (retryable)
```

Legacy `pending-delete` rows from the old undo window are settled to `deleted` during cleanup hydrate.

## 14. Upload state machine

```text
not-queued
→ queued
→ rendering
→ encoding (MP3 only)
→ uploading
→ processing
→ uploaded
```

Any active state may transition to:

- failed
- canceled where supported

Retry returns to the earliest required step.

Examples:

- Existing valid rendered file: retry upload
- Missing rendered file: retry render
- Source changed: invalidate rendered asset and restart render

## 15. Render cache key

Rendered output should be keyed by:

- Source file identity/hash
- Edit recipe version/content
- Output settings
- Channel conversion
- Sample-rate conversion

Changing metadata alone must not invalidate rendered audio.

## 16. Error model

```ts
interface AppError {
	code: string;
	message: string;
	recoverable: boolean;
	cause?: unknown;
	context?: Record<string, string | number | boolean>;
	occurredAt: string;
}
```

Suggested codes:

- `MIC_PERMISSION_DENIED`
- `MIC_UNAVAILABLE`
- `RECORDER_UNSUPPORTED`
- `RECORDER_FAILED`
- `STORAGE_QUOTA_LOW`
- `SOURCE_SAVE_FAILED`
- `DECODE_FAILED`
- `PEAK_ANALYSIS_FAILED`
- `RENDER_FAILED`
- `ENCODE_FAILED`
- `AUDIOTOOL_AUTH_FAILED`
- `AUDIOTOOL_PERMISSION_FAILED`
- `UPLOAD_FAILED`
- `PROCESSING_FAILED`

Do not expose raw token or sensitive response data in errors.
