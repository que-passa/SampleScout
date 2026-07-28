import { YAMNET_MAX_WINDOWS, YAMNET_WINDOW_SAMPLES } from '$lib/config/audio-tags';

/** Downmix planar PCM to mono (equal-power average). */
export function monoDownmix(channels: readonly Float32Array[]): Float32Array {
	if (channels.length === 0) return new Float32Array(0);
	if (channels.length === 1) return channels[0] ?? new Float32Array(0);

	const frameCount = channels[0]?.length ?? 0;
	const mono = new Float32Array(frameCount);
	const weight = 1 / channels.length;
	for (let ch = 0; ch < channels.length; ch += 1) {
		const channel = channels[ch];
		if (!channel) continue;
		for (let i = 0; i < frameCount; i += 1) {
			mono[i] = (mono[i] ?? 0) + (channel[i] ?? 0) * weight;
		}
	}
	return mono;
}

/** Linear resample mono PCM to `targetRate` (sufficient for YAMNet windowing). */
export function resampleMono(
	mono: Float32Array,
	sourceRate: number,
	targetRate: number
): Float32Array {
	if (sourceRate <= 0 || targetRate <= 0 || mono.length === 0) return new Float32Array(0);
	if (Math.abs(sourceRate - targetRate) < 1) return mono;

	const ratio = sourceRate / targetRate;
	const outLength = Math.max(1, Math.floor(mono.length / ratio));
	const out = new Float32Array(outLength);

	for (let i = 0; i < outLength; i += 1) {
		const sourceIndex = i * ratio;
		const left = Math.floor(sourceIndex);
		const right = Math.min(mono.length - 1, left + 1);
		const frac = sourceIndex - left;
		const a = mono[left] ?? 0;
		const b = mono[right] ?? 0;
		out[i] = a + (b - a) * frac;
	}

	return out;
}

/** Start indices for fixed-length YAMNet windows, evenly spaced across the clip. */
export function planClassificationWindows(
	sampleCount: number,
	windowSamples: number = YAMNET_WINDOW_SAMPLES,
	maxWindows: number = YAMNET_MAX_WINDOWS
): number[] {
	if (sampleCount <= 0 || windowSamples <= 0 || maxWindows <= 0) return [];

	if (sampleCount <= windowSamples) return [0];

	const span = sampleCount - windowSamples;
	const windows = Math.min(maxWindows, Math.max(1, Math.floor(sampleCount / windowSamples)));
	if (windows === 1) {
		return [Math.max(0, Math.floor(span / 2))];
	}

	const starts: number[] = [];
	for (let i = 0; i < windows; i += 1) {
		const start = Math.round((span * i) / (windows - 1));
		starts.push(Math.min(span, Math.max(0, start)));
	}

	return [...new Set(starts)].sort((a, b) => a - b);
}

export function sliceWindow(
	mono: Float32Array,
	start: number,
	windowSamples: number
): Float32Array {
	const end = Math.min(mono.length, start + windowSamples);
	const slice = mono.subarray(start, end);
	if (slice.length === windowSamples) return slice;

	const padded = new Float32Array(windowSamples);
	padded.set(slice);
	return padded;
}
