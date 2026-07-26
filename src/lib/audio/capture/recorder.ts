import { createAppError } from '$lib/domain/ids';
import type { AppError } from '$lib/domain/types';
import {
	LIVE_PEAK_INTERVAL_MS,
	RECORDING_MAX_SECONDS,
	recordingWarningLevel,
	remainingRecordingSeconds,
	type RecordingWarningLevel
} from '$lib/config/recording';
import { pickSupportedRecorderMime } from './mime';

export type CapturePhase = 'idle' | 'requesting' | 'recording' | 'finalizing' | 'error';

/** Min/max amplitude bucket from a live analyser window (−1…1). */
export interface CapturePeakBucket {
	min: number;
	max: number;
}

export interface CaptureLevelSnapshot {
	/** 0–1 linear RMS-ish level for UI meter. */
	level: number;
	clipping: boolean;
	/** Real min/max of the current time-domain window for live waveform. */
	peak: CapturePeakBucket;
}

export interface CaptureTick {
	elapsedSeconds: number;
	remainingSeconds: number;
	warning: RecordingWarningLevel;
	levels: CaptureLevelSnapshot;
}

export interface CaptureResult {
	blob: Blob;
	mimeType: string;
	recorderMimeType: string;
	/** Monotonic wall-clock duration while MediaRecorder was active. */
	elapsedSeconds: number;
	channelCount?: number;
	sampleRate?: number;
	canceled: boolean;
}

export interface CaptureSessionHandle {
	start(): Promise<void>;
	stop(): Promise<CaptureResult>;
	cancel(): Promise<CaptureResult>;
	getPhase(): CapturePhase;
	getElapsedSeconds(): number;
	dispose(): void;
}

export interface CreateCaptureOptions {
	timesliceMs?: number;
	maxSeconds?: number;
	onTick?: (tick: CaptureTick) => void;
	onAutoStop?: () => void;
	onError?: (error: AppError) => void;
}

const CLIP_THRESHOLD = 0.98;

export async function createCaptureSession(
	options: CreateCaptureOptions = {}
): Promise<CaptureSessionHandle> {
	const timesliceMs = options.timesliceMs ?? 1000;
	const maxSeconds = options.maxSeconds ?? RECORDING_MAX_SECONDS;
	const mimeType = pickSupportedRecorderMime();

	if (!mimeType) {
		throw createAppError(
			'MEDIA_RECORDER_UNSUPPORTED',
			'No supported MediaRecorder MIME type is available in this browser.',
			{ recoverable: false }
		);
	}

	if (!navigator.mediaDevices?.getUserMedia) {
		throw createAppError(
			'GET_USER_MEDIA_UNSUPPORTED',
			'Microphone capture is not available in this browser.',
			{ recoverable: false }
		);
	}

	let phase: CapturePhase = 'idle';
	let mediaStream: MediaStream | undefined;
	let recorder: MediaRecorder | undefined;
	let audioContext: AudioContext | undefined;
	let analyser: AnalyserNode | undefined;
	let sourceNode: MediaStreamAudioSourceNode | undefined;
	let startedAtMs = 0;
	let elapsedSeconds = 0;
	let tickTimer: ReturnType<typeof setInterval> | undefined;
	let autoStopTimer: ReturnType<typeof setTimeout> | undefined;
	let chunks: Blob[] = [];
	let stopResolver: ((result: CaptureResult) => void) | undefined;
	let canceled = false;
	let channelCount: number | undefined;
	let sampleRate: number | undefined;
	const analyserBuffer = new Float32Array(2048);

	const clearTimers = () => {
		if (tickTimer !== undefined) {
			clearInterval(tickTimer);
			tickTimer = undefined;
		}
		if (autoStopTimer !== undefined) {
			clearTimeout(autoStopTimer);
			autoStopTimer = undefined;
		}
	};

	const readLevels = (): CaptureLevelSnapshot => {
		if (!analyser) {
			return { level: 0, clipping: false, peak: { min: 0, max: 0 } };
		}
		analyser.getFloatTimeDomainData(analyserBuffer);
		let sumSquares = 0;
		let peakAbs = 0;
		let min = 1;
		let max = -1;
		for (let i = 0; i < analyserBuffer.length; i += 1) {
			const sample = analyserBuffer[i] ?? 0;
			sumSquares += sample * sample;
			peakAbs = Math.max(peakAbs, Math.abs(sample));
			if (sample < min) min = sample;
			if (sample > max) max = sample;
		}
		const rms = Math.sqrt(sumSquares / analyserBuffer.length);
		return {
			level: Math.min(1, rms * 3.2),
			clipping: peakAbs >= CLIP_THRESHOLD,
			peak: { min, max }
		};
	};

	const emitTick = () => {
		if (phase !== 'recording' || startedAtMs === 0) return;
		elapsedSeconds = (performance.now() - startedAtMs) / 1000;
		options.onTick?.({
			elapsedSeconds,
			remainingSeconds: remainingRecordingSeconds(elapsedSeconds),
			warning: recordingWarningLevel(elapsedSeconds),
			levels: readLevels()
		});
	};

	const teardownGraph = () => {
		try {
			sourceNode?.disconnect();
		} catch {
			/* ignore */
		}
		sourceNode = undefined;
		analyser = undefined;
		if (audioContext) {
			void audioContext.close().catch(() => undefined);
			audioContext = undefined;
		}
		if (mediaStream) {
			for (const track of mediaStream.getTracks()) {
				track.stop();
			}
			mediaStream = undefined;
		}
	};

	const finalize = async (): Promise<CaptureResult> => {
		clearTimers();
		const recorderMimeType = recorder?.mimeType || mimeType;
		const blob = new Blob(chunks, { type: recorderMimeType || mimeType });
		const finalElapsed =
			startedAtMs === 0 ? 0 : Math.max(elapsedSeconds, (performance.now() - startedAtMs) / 1000);

		teardownGraph();
		recorder = undefined;
		phase = 'idle';

		return {
			blob,
			mimeType: blob.type || mimeType,
			recorderMimeType,
			elapsedSeconds: finalElapsed,
			channelCount,
			sampleRate,
			canceled
		};
	};

	const awaitRecorderStop = (): Promise<CaptureResult> =>
		new Promise((resolve) => {
			stopResolver = resolve;
			if (!recorder || recorder.state === 'inactive') {
				void finalize().then(resolve);
				return;
			}
			try {
				recorder.stop();
			} catch (cause) {
				options.onError?.(
					createAppError('RECORDING_STOP_FAILED', 'Failed to stop MediaRecorder.', {
						cause,
						recoverable: true
					})
				);
				void finalize().then(resolve);
			}
		});

	return {
		async start() {
			if (phase === 'recording' || phase === 'requesting') return;
			phase = 'requesting';
			canceled = false;
			chunks = [];
			elapsedSeconds = 0;

			try {
				mediaStream = await navigator.mediaDevices.getUserMedia({
					audio: {
						echoCancellation: false,
						noiseSuppression: false,
						autoGainControl: false
					},
					video: false
				});
			} catch (cause) {
				phase = 'error';
				const error = createAppError(
					'MIC_PERMISSION_DENIED',
					'Microphone permission is required to record.',
					{ cause, recoverable: true }
				);
				options.onError?.(error);
				throw error;
			}

			const track = mediaStream.getAudioTracks()[0];
			const settings = track?.getSettings();
			channelCount = settings?.channelCount;
			sampleRate = settings?.sampleRate;

			try {
				const AudioContextCtor =
					window.AudioContext ||
					(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
				if (AudioContextCtor) {
					audioContext = new AudioContextCtor();
					analyser = audioContext.createAnalyser();
					analyser.fftSize = 2048;
					sourceNode = audioContext.createMediaStreamSource(mediaStream);
					sourceNode.connect(analyser);
					sampleRate = sampleRate ?? audioContext.sampleRate;
				}
			} catch {
				/* Meter is optional; recording can continue without it. */
			}

			try {
				recorder = new MediaRecorder(mediaStream, { mimeType });
			} catch (cause) {
				teardownGraph();
				phase = 'error';
				const error = createAppError(
					'MEDIA_RECORDER_INIT_FAILED',
					'Could not start MediaRecorder with the selected MIME type.',
					{ cause, recoverable: true, context: { mimeType } }
				);
				options.onError?.(error);
				throw error;
			}

			recorder.addEventListener('dataavailable', (event) => {
				if (event.data.size > 0) chunks.push(event.data);
			});

			recorder.addEventListener('error', () => {
				options.onError?.(
					createAppError('MEDIA_RECORDER_ERROR', 'MediaRecorder reported an error.', {
						recoverable: true
					})
				);
			});

			recorder.addEventListener('stop', () => {
				void finalize().then((result) => {
					stopResolver?.(result);
					stopResolver = undefined;
				});
			});

			recorder.start(timesliceMs);
			startedAtMs = performance.now();
			phase = 'recording';
			emitTick();
			tickTimer = setInterval(emitTick, LIVE_PEAK_INTERVAL_MS);
			// Caller is responsible for stop/save via onAutoStop (do not finalize here).
			autoStopTimer = setTimeout(() => {
				if (phase === 'recording') {
					options.onAutoStop?.();
				}
			}, maxSeconds * 1000);
		},

		async stop() {
			if (phase === 'idle') {
				return {
					blob: new Blob([], { type: mimeType }),
					mimeType,
					recorderMimeType: mimeType,
					elapsedSeconds: 0,
					canceled: true
				};
			}
			canceled = false;
			phase = 'finalizing';
			return awaitRecorderStop();
		},

		async cancel() {
			canceled = true;
			phase = 'finalizing';
			return awaitRecorderStop();
		},

		getPhase() {
			return phase;
		},

		getElapsedSeconds() {
			if (phase === 'recording' && startedAtMs > 0) {
				return (performance.now() - startedAtMs) / 1000;
			}
			return elapsedSeconds;
		},

		dispose() {
			clearTimers();
			if (recorder && recorder.state !== 'inactive') {
				try {
					recorder.stop();
				} catch {
					/* ignore */
				}
			}
			teardownGraph();
			chunks = [];
			phase = 'idle';
		}
	};
}
