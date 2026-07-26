import { createTakeDraft, isTakeSavedLocally } from '$lib/domain/metadata';
import { createAppError, nowIso } from '$lib/domain/ids';
import { deriveCatalogReference, formatFieldSessionName } from '$lib/domain/catalog';
import type { AppError, CaptureSession, Take } from '$lib/domain/types';
import {
	createCaptureSession,
	type CaptureLevelSnapshot,
	type CapturePeakBucket,
	type CapturePhase,
	type CaptureSessionHandle,
	type CaptureTick
} from '$lib/audio/capture';
import { decodeAudioSummary } from '$lib/audio/decode';
import { RECORDING_MAX_SECONDS, type RecordingWarningLevel } from '$lib/config/recording';
import { writeBinary } from '$lib/persistence/opfs';
import { sourcePath } from '$lib/persistence/paths';
import { ensureActiveSession, putSession, renameSession } from '$lib/persistence/sessions';
import { checkStorageForRecording } from '$lib/persistence/storage-gate';
import {
	commitSavedTake,
	listTakesForSession,
	nextSequenceForSession
} from '$lib/persistence/takes';
import { processDueCleanups } from '$lib/persistence/cleanup';
import { runMigrations } from '$lib/persistence/db';
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { actionToast } from './action-toast';

export type CaptureUiPhase = CapturePhase | 'blocked' | 'ready';

const idleLevels = (): CaptureLevelSnapshot => ({
	level: 0,
	clipping: false,
	peak: { min: 0, max: 0 }
});

export interface CaptureStore {
	ready: boolean;
	session: CaptureSession | null;
	takes: Take[];
	phase: CaptureUiPhase;
	elapsedSeconds: number;
	remainingSeconds: number;
	warning: RecordingWarningLevel;
	levels: CaptureLevelSnapshot;
	/** Growing live overview peaks while recording (analyser min/max buckets). */
	livePeaks: CapturePeakBucket[];
	error: AppError | null;
	statusMessage: string;
	playingTakeId: string | null;
}

type Listener = () => void;

function formatDuration(seconds: number): string {
	const clamped = Math.max(0, Math.floor(seconds));
	const mins = Math.floor(clamped / 60);
	const secs = clamped % 60;
	return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

class CaptureController {
	#listeners = new Set<Listener>();
	#recorder: CaptureSessionHandle | undefined;
	#hydratePromise: Promise<void> | undefined;

	ready = false;
	session: CaptureSession | null = null;
	takes: Take[] = [];
	phase: CaptureUiPhase = 'idle';
	elapsedSeconds = 0;
	remainingSeconds = RECORDING_MAX_SECONDS;
	warning: RecordingWarningLevel = 'none';
	levels: CaptureLevelSnapshot = idleLevels();
	livePeaks: CapturePeakBucket[] = [];
	error: AppError | null = null;
	statusMessage = '';
	playingTakeId: string | null = null;

	subscribe = (listener: Listener): (() => void) => {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	};

	#notify() {
		for (const listener of this.#listeners) listener();
	}

	#set(partial: Partial<CaptureStore>) {
		Object.assign(this, partial);
		this.#notify();
	}

	async hydrate(sessionName = formatFieldSessionName()): Promise<void> {
		if (this.#hydratePromise) {
			try {
				await this.#hydratePromise;
			} catch {
				// Error state already published by the in-flight hydrate.
			}
			// Remounted Capture UI may have missed the original notify — re-publish.
			if (this.ready) this.#notify();
			return;
		}

		this.#hydratePromise = (async () => {
			await runMigrations();
			await processDueCleanups();
			const session = await ensureActiveSession(sessionName);
			const takes = await listTakesForSession(session.id);
			this.#set({
				ready: true,
				session,
				takes,
				phase: 'ready',
				statusMessage: takes.length
					? `${takes.length} Local Draft${takes.length === 1 ? '' : 's'} restored from this device.`
					: 'Ready to capture.'
			});
		})();

		try {
			await this.#hydratePromise;
		} catch (cause) {
			this.#hydratePromise = undefined;
			const error = createAppError(
				'SESSION_HYDRATE_FAILED',
				'Could not restore the local capture session.',
				{ cause, recoverable: true }
			);
			this.#set({ ready: true, phase: 'error', error, statusMessage: error.message });
		}
	}

	async setSessionName(name: string): Promise<void> {
		if (!this.session) return;
		const updated = await renameSession(this.session.id, name);
		if (updated) this.#set({ session: updated });
	}

	get newestTakes(): Take[] {
		return [...this.takes].sort((a, b) => b.sequence - a.sequence);
	}

	async toggleRecord(): Promise<void> {
		if (this.phase === 'recording' || this.phase === 'finalizing') {
			await this.stopRecording();
			return;
		}
		await this.startRecording();
	}

	async startRecording(): Promise<void> {
		if (!this.session || this.phase === 'recording' || this.phase === 'finalizing') return;

		this.#set({ error: null, statusMessage: 'Checking storage…' });
		const gate = await checkStorageForRecording();
		if (!gate.ok) {
			this.#set({
				phase: 'blocked',
				error: gate.error ?? null,
				statusMessage: gate.error?.message ?? 'Storage check failed.'
			});
			return;
		}

		this.#set({
			phase: 'requesting',
			elapsedSeconds: 0,
			remainingSeconds: RECORDING_MAX_SECONDS,
			warning: 'none',
			levels: idleLevels(),
			livePeaks: [],
			statusMessage: 'Requesting microphone…'
		});

		try {
			this.#recorder?.dispose();
			this.#recorder = await createCaptureSession({
				onTick: (tick: CaptureTick) => {
					this.livePeaks.push(tick.levels.peak);
					this.#set({
						elapsedSeconds: tick.elapsedSeconds,
						remainingSeconds: tick.remainingSeconds,
						warning: tick.warning,
						levels: tick.levels,
						livePeaks: this.livePeaks,
						statusMessage: this.#recordingStatus(tick)
					});
				},
				onAutoStop: () => {
					this.#set({ statusMessage: 'Ten-minute limit reached — saving…' });
					void this.stopRecording();
				},
				onError: (error) => {
					this.#set({ error, statusMessage: error.message });
				}
			});
			await this.#recorder.start();
			this.#set({
				phase: 'recording',
				statusMessage: 'Recording…'
			});
		} catch (cause) {
			const error =
				cause && typeof cause === 'object' && 'code' in cause
					? (cause as AppError)
					: createAppError('RECORDING_START_FAILED', 'Could not start recording.', {
							cause,
							recoverable: true
						});
			this.#recorder?.dispose();
			this.#recorder = undefined;
			this.#set({
				phase: 'error',
				error,
				statusMessage: error.message,
				levels: idleLevels(),
				livePeaks: []
			});
		}
	}

	async stopRecording(): Promise<void> {
		if (!this.#recorder || !this.session) return;
		if (this.phase !== 'recording' && this.phase !== 'finalizing') return;

		this.#set({
			phase: 'finalizing',
			statusMessage: 'Finalizing take…',
			levels: idleLevels()
		});

		const result = await this.#recorder.stop();
		this.#recorder.dispose();
		this.#recorder = undefined;

		if (result.canceled || result.blob.size === 0) {
			this.#set({
				phase: 'ready',
				elapsedSeconds: 0,
				remainingSeconds: RECORDING_MAX_SECONDS,
				warning: 'none',
				livePeaks: [],
				statusMessage: 'Recording canceled.'
			});
			return;
		}

		try {
			const saved = await this.#persistTake(result.blob, result);
			const savedLocally = isTakeSavedLocally(saved.take);
			this.#set({
				phase: 'ready',
				elapsedSeconds: 0,
				remainingSeconds: RECORDING_MAX_SECONDS,
				warning: 'none',
				livePeaks: [],
				session: saved.session,
				takes: saved.takes,
				// Success feedback is the action toast; avoid a sticky Capture status line.
				statusMessage: savedLocally ? '' : 'Take finalized but not marked saved.'
			});
			if (savedLocally) {
				const label = saved.take.metadata.displayName || deriveCatalogReference(saved.take);
				const takeId = saved.take.id;
				actionToast.show(`Captured · ${label}`, {
					actionLabel: 'Open',
					onAction: async () => {
						await goto(resolve(`/take/${takeId}`));
					}
				});
			}
		} catch (cause) {
			const error = createAppError(
				'SOURCE_SAVE_FAILED',
				'Capture finished but could not be saved on this device.',
				{ cause, recoverable: true }
			);
			const takes = this.session ? await listTakesForSession(this.session.id) : this.takes;
			this.#set({
				phase: 'error',
				error,
				livePeaks: [],
				takes,
				statusMessage: error.message
			});
		}
	}

	async cancelRecording(): Promise<void> {
		if (!this.#recorder) return;
		this.#set({ phase: 'finalizing', statusMessage: 'Canceling…' });
		await this.#recorder.cancel();
		this.#recorder.dispose();
		this.#recorder = undefined;
		this.#set({
			phase: 'ready',
			elapsedSeconds: 0,
			remainingSeconds: RECORDING_MAX_SECONDS,
			warning: 'none',
			levels: idleLevels(),
			livePeaks: [],
			statusMessage: 'Recording discarded.'
		});
	}

	async #persistTake(
		blob: Blob,
		meta: {
			mimeType: string;
			recorderMimeType: string;
			elapsedSeconds: number;
			channelCount?: number;
			sampleRate?: number;
		}
	): Promise<{ take: Take; session: CaptureSession; takes: Take[] }> {
		if (!this.session) {
			throw createAppError('SESSION_MISSING', 'No active session to save into.', {
				recoverable: true
			});
		}

		let durationSeconds = meta.elapsedSeconds;
		let channelCount = meta.channelCount;
		let sampleRate = meta.sampleRate;

		try {
			const decoded = await decodeAudioSummary(blob);
			durationSeconds = decoded.durationSeconds || durationSeconds;
			channelCount = decoded.channelCount;
			sampleRate = decoded.sampleRate;
		} catch {
			/* Fall back to monotonic timer duration. */
		}

		const sequence = await nextSequenceForSession(this.session.id);
		const draft = createTakeDraft({
			session: this.session,
			sequence,
			source: {
				fileRef: '',
				mimeType: meta.mimeType,
				byteLength: blob.size,
				durationSeconds,
				channelCount,
				sampleRate,
				recorderMimeType: meta.recorderMimeType,
				sourceType: 'recording'
			}
		});

		const path = sourcePath(this.session.id, draft.id);
		const written = await writeBinary(path, blob);

		const pending: Take = {
			...draft,
			source: {
				...draft.source,
				fileRef: written.fileRef,
				byteLength: written.byteLength
			},
			updatedAt: nowIso()
		};

		const committed = await commitSavedTake(pending, this.session);
		const takes = await listTakesForSession(committed.session.id);

		try {
			if (navigator.storage?.persist) {
				await navigator.storage.persist();
			}
		} catch {
			/* Persistent storage denial is normal. */
		}

		return { take: committed.take, session: committed.session, takes };
	}

	#recordingStatus(tick: CaptureTick): string {
		const elapsed = formatDuration(tick.elapsedSeconds);
		switch (tick.warning) {
			case 'passive':
				return `Recording ${elapsed} · past 5 minutes`;
			case 'remaining':
				return `Recording ${elapsed} · ${formatDuration(tick.remainingSeconds)} left`;
			case 'strong':
				return `Recording ${elapsed} · under 1 minute left`;
			case 'limit':
				return 'Limit reached — saving…';
			default:
				return `Recording ${elapsed}`;
		}
	}

	async refreshTakes(): Promise<void> {
		if (!this.session) return;
		const takes = await listTakesForSession(this.session.id);
		const session = (await ensureActiveSession(this.session.name)) ?? this.session;
		this.#set({ takes, session });
	}

	/** Re-load after wipe-all. */
	async reset(): Promise<void> {
		this.#recorder?.dispose();
		this.#recorder = undefined;
		this.#hydratePromise = undefined;
		this.#set({
			ready: false,
			session: null,
			takes: [],
			phase: 'idle',
			elapsedSeconds: 0,
			remainingSeconds: RECORDING_MAX_SECONDS,
			warning: 'none',
			levels: idleLevels(),
			livePeaks: [],
			error: null,
			statusMessage: '',
			playingTakeId: null
		});
		await this.hydrate();
	}
}

export const captureController = new CaptureController();

export function getCaptureSnapshot(): CaptureStore {
	return {
		ready: captureController.ready,
		session: captureController.session,
		takes: captureController.takes,
		phase: captureController.phase,
		elapsedSeconds: captureController.elapsedSeconds,
		remainingSeconds: captureController.remainingSeconds,
		warning: captureController.warning,
		levels: captureController.levels,
		livePeaks: captureController.livePeaks,
		error: captureController.error,
		statusMessage: captureController.statusMessage,
		playingTakeId: captureController.playingTakeId
	};
}

/** Keep session name edits durable without waiting for blur-only flows. */
export async function persistSessionName(name: string): Promise<void> {
	await captureController.setSessionName(name);
	if (captureController.session) {
		await putSession(captureController.session);
	}
}

export { formatDuration };
