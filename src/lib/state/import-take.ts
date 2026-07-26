import { RECORDING_MAX_SECONDS } from '$lib/config/recording';
import { blobWithAudioType, decodeAudioSummary } from '$lib/audio/decode';
import { createAppError, nowIso } from '$lib/domain/ids';
import { createTakeDraft } from '$lib/domain/metadata';
import type { AppError, Take } from '$lib/domain/types';
import {
	checkStorageForImport,
	commitSavedTake,
	ensureActiveSession,
	nextSequenceForSession,
	sourcePath,
	writeBinary
} from '$lib/persistence';
import { notifyTakeInventoryChanged } from './take-actions';

export interface ImportAudioFilesResult {
	imported: Take[];
	errors: AppError[];
}

function isAppError(value: unknown): value is AppError {
	return (
		typeof value === 'object' &&
		value !== null &&
		'code' in value &&
		'message' in value &&
		typeof (value as AppError).code === 'string' &&
		typeof (value as AppError).message === 'string'
	);
}

/** Reject imports longer than the shared capture editing limit. */
export function assertImportDurationAllowed(durationSeconds: number): void {
	if (durationSeconds > RECORDING_MAX_SECONDS) {
		throw createAppError(
			'IMPORT_TOO_LONG',
			`Imported audio must be ${RECORDING_MAX_SECONDS / 60} minutes or shorter.`,
			{
				recoverable: true,
				context: { durationSeconds, maxSeconds: RECORDING_MAX_SECONDS }
			}
		);
	}
}

/** Build the pre-OPFS draft shape used for imports (testable without storage). */
export function buildImportTakeDraft(input: {
	session: Parameters<typeof createTakeDraft>[0]['session'];
	sequence: number;
	file: Pick<File, 'name' | 'type' | 'size'>;
	durationSeconds: number;
	channelCount: number;
	sampleRate: number;
}): Take {
	return createTakeDraft({
		session: input.session,
		sequence: input.sequence,
		source: {
			fileRef: '',
			mimeType: input.file.type || 'application/octet-stream',
			byteLength: input.file.size,
			durationSeconds: input.durationSeconds,
			channelCount: input.channelCount,
			sampleRate: input.sampleRate,
			sourceType: 'import',
			originalFileName: input.file.name
		}
	});
}

/**
 * Import one audio file into the active Field Session as a Local Draft.
 * Saved only after OPFS write and IndexedDB commit both succeed.
 */
export async function importAudioFile(
	file: File,
	options: { notify?: boolean } = {}
): Promise<Take> {
	const notify = options.notify !== false;
	const gate = await checkStorageForImport(file.size);
	if (!gate.ok && gate.error) {
		throw gate.error;
	}

	let summary;
	try {
		const typed = await blobWithAudioType(file, file.type || undefined);
		summary = await decodeAudioSummary(typed);
	} catch (cause) {
		if (isAppError(cause) && cause.code === 'DECODE_FAILED') {
			throw createAppError(
				'IMPORT_DECODE_FAILED',
				`Could not decode “${file.name}”. Try WAV, MP3, or another browser-supported audio file.`,
				{ recoverable: true, cause, context: { fileName: file.name } }
			);
		}
		if (isAppError(cause)) throw cause;
		throw createAppError(
			'IMPORT_DECODE_FAILED',
			`Could not decode “${file.name}”. Try WAV, MP3, or another browser-supported audio file.`,
			{ recoverable: true, cause, context: { fileName: file.name } }
		);
	}

	assertImportDurationAllowed(summary.durationSeconds);

	const session = await ensureActiveSession();
	const sequence = await nextSequenceForSession(session.id);
	const draft = buildImportTakeDraft({
		session,
		sequence,
		file,
		durationSeconds: summary.durationSeconds,
		channelCount: summary.channelCount,
		sampleRate: summary.sampleRate
	});

	const path = sourcePath(session.id, draft.id);
	const written = await writeBinary(path, file);

	const pending: Take = {
		...draft,
		source: {
			...draft.source,
			fileRef: written.fileRef,
			byteLength: written.byteLength
		},
		updatedAt: nowIso()
	};

	const committed = await commitSavedTake(pending, session);

	try {
		if (navigator.storage?.persist) {
			await navigator.storage.persist();
		}
	} catch {
		/* Persistent storage denial is normal. */
	}

	if (notify) {
		await notifyTakeInventoryChanged();
	}
	return committed.take;
}

/**
 * Import multiple files sequentially. Failures do not roll back earlier successes.
 */
export async function importAudioFiles(files: File[]): Promise<ImportAudioFilesResult> {
	const imported: Take[] = [];
	const errors: AppError[] = [];

	for (const file of files) {
		try {
			imported.push(await importAudioFile(file, { notify: false }));
		} catch (cause) {
			if (isAppError(cause)) {
				errors.push({
					...cause,
					context: { ...cause.context, fileName: file.name }
				});
			} else {
				errors.push(
					createAppError('IMPORT_FAILED', `Import failed for “${file.name}”.`, {
						recoverable: true,
						cause,
						context: { fileName: file.name }
					})
				);
			}
		}
	}

	if (imported.length > 0) {
		await notifyTakeInventoryChanged();
	}

	return { imported, errors };
}
