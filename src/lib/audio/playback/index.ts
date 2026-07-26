import { createAppError } from '$lib/domain/ids';
import type { FileRef } from '$lib/domain/types';
import { readBinary } from '$lib/persistence/opfs';

export interface PlaybackHandle {
	play(): Promise<void>;
	pause(): void;
	stop(): void;
	seek(seconds: number): void;
	getCurrentTime(): number;
	getDuration(): number;
	isPlaying(): boolean;
	/** Fires when playback reaches the end. */
	onEnded(handler: (() => void) | null): void;
	dispose(): void;
}

/**
 * Simple HTMLAudioElement playback from an OPFS file ref or in-memory blob.
 */
export async function createPlaybackFromBlob(blob: Blob): Promise<PlaybackHandle> {
	const url = URL.createObjectURL(blob);
	const audio = new Audio(url);
	audio.preload = 'auto';
	let endedHandler: (() => void) | null = null;

	const handleEnded = () => {
		endedHandler?.();
	};
	audio.addEventListener('ended', handleEnded);

	await new Promise<void>((resolve, reject) => {
		const onReady = () => {
			cleanup();
			resolve();
		};
		const onError = () => {
			cleanup();
			reject(
				createAppError('PLAYBACK_LOAD_FAILED', 'Could not load audio for playback.', {
					recoverable: true
				})
			);
		};
		const cleanup = () => {
			audio.removeEventListener('canplaythrough', onReady);
			audio.removeEventListener('error', onError);
		};
		audio.addEventListener('canplaythrough', onReady, { once: true });
		audio.addEventListener('error', onError, { once: true });
		void audio.load();
	});

	return {
		async play() {
			await audio.play();
		},
		pause() {
			audio.pause();
		},
		stop() {
			audio.pause();
			audio.currentTime = 0;
		},
		seek(seconds: number) {
			const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
			audio.currentTime = Math.max(0, Math.min(duration || seconds, seconds));
		},
		getCurrentTime() {
			return audio.currentTime;
		},
		getDuration() {
			return Number.isFinite(audio.duration) ? audio.duration : 0;
		},
		isPlaying() {
			return !audio.paused && !audio.ended;
		},
		onEnded(handler) {
			endedHandler = handler;
		},
		dispose() {
			audio.pause();
			audio.removeEventListener('ended', handleEnded);
			endedHandler = null;
			URL.revokeObjectURL(url);
		}
	};
}

export async function createPlaybackFromFileRef(
	fileRef: FileRef,
	mimeType?: string
): Promise<PlaybackHandle> {
	const file = await readBinary(fileRef);
	const blob =
		mimeType && file.type !== mimeType
			? new Blob([await file.arrayBuffer()], { type: mimeType })
			: file;
	return createPlaybackFromBlob(blob);
}

function getAudioContextCtor(): typeof AudioContext | undefined {
	if (typeof window === 'undefined') return undefined;
	return (
		window.AudioContext ||
		(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
	);
}

/**
 * Web Audio preview from an in-memory AudioBuffer (edited recipe output).
 * Caller owns buffer lifetime; dispose stops playback but does not detach PCM.
 */
export async function createPlaybackFromAudioBuffer(buffer: AudioBuffer): Promise<PlaybackHandle> {
	const AudioContextCtor = getAudioContextCtor();
	if (!AudioContextCtor) {
		throw createAppError('WEBAUDIO_UNSUPPORTED', 'Web Audio is unavailable for playback.', {
			recoverable: true
		});
	}

	const context = new AudioContextCtor();
	let sourceNode: AudioBufferSourceNode | null = null;
	let startedAt = 0;
	let offsetSeconds = 0;
	let playing = false;
	let endedHandler: (() => void) | null = null;
	const duration = buffer.duration;

	const stopSource = () => {
		if (sourceNode) {
			try {
				sourceNode.onended = null;
				sourceNode.stop();
			} catch {
				/* already stopped */
			}
			sourceNode.disconnect();
			sourceNode = null;
		}
		playing = false;
	};

	const startFrom = async (offset: number) => {
		stopSource();
		if (context.state === 'suspended') {
			await context.resume();
		}
		const clamped = Math.max(0, Math.min(duration, offset));
		offsetSeconds = clamped;
		if (clamped >= duration - 1e-6) {
			endedHandler?.();
			return;
		}
		const node = context.createBufferSource();
		node.buffer = buffer;
		node.connect(context.destination);
		node.onended = () => {
			if (sourceNode !== node) return;
			playing = false;
			offsetSeconds = duration;
			sourceNode = null;
			endedHandler?.();
		};
		sourceNode = node;
		startedAt = context.currentTime;
		playing = true;
		node.start(0, clamped);
	};

	return {
		async play() {
			await startFrom(offsetSeconds >= duration ? 0 : offsetSeconds);
		},
		pause() {
			if (!playing) return;
			offsetSeconds = Math.min(duration, offsetSeconds + (context.currentTime - startedAt));
			stopSource();
		},
		stop() {
			stopSource();
			offsetSeconds = 0;
		},
		seek(seconds: number) {
			const next = Math.max(0, Math.min(duration, seconds));
			if (playing) {
				void startFrom(next);
			} else {
				offsetSeconds = next;
			}
		},
		getCurrentTime() {
			if (playing) {
				return Math.min(duration, offsetSeconds + (context.currentTime - startedAt));
			}
			return offsetSeconds;
		},
		getDuration() {
			return duration;
		},
		isPlaying() {
			return playing;
		},
		onEnded(handler) {
			endedHandler = handler;
		},
		dispose() {
			stopSource();
			endedHandler = null;
			void context.close().catch(() => undefined);
		}
	};
}
