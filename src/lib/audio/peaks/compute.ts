/** Pure PCM → min/max peak buckets (shared by worker + main-thread fallback). */

export interface PeakComputeInput {
	/** Planar PCM channels in [-1, 1]. */
	channels: Float32Array[];
	/** Source frames per output peak bucket. */
	framesPerPeak: number;
}

export interface PeakComputeResult {
	channels: number;
	peakCount: number;
	framesPerPeak: number;
	/**
	 * Planar interleaved min/max pairs:
	 * for each channel: [min0, max0, min1, max1, ...]
	 */
	data: Float32Array;
}

export const TARGET_OVERVIEW_PEAKS = 4096;
export const MIN_FRAMES_PER_PEAK = 1;

/**
 * Choose frames-per-peak so overview stays near {@link TARGET_OVERVIEW_PEAKS}.
 */
export function framesPerPeakForLength(frameCount: number, targetPeaks = TARGET_OVERVIEW_PEAKS): number {
	if (frameCount <= 0) return MIN_FRAMES_PER_PEAK;
	const target = Math.max(1, targetPeaks);
	return Math.max(MIN_FRAMES_PER_PEAK, Math.ceil(frameCount / target));
}

/**
 * Compute true min/max amplitude per bucket. Preserves transients (no averaging).
 */
export function computePeaksPlanar(input: PeakComputeInput): PeakComputeResult {
	const channelArrays = input.channels;
	const channels = channelArrays.length;
	if (channels === 0) {
		return {
			channels: 0,
			peakCount: 0,
			framesPerPeak: Math.max(MIN_FRAMES_PER_PEAK, Math.floor(input.framesPerPeak) || 1),
			data: new Float32Array(0)
		};
	}

	const framesPerPeak = Math.max(MIN_FRAMES_PER_PEAK, Math.floor(input.framesPerPeak) || 1);
	const frameCount = channelArrays[0]?.length ?? 0;
	const peakCount = frameCount === 0 ? 0 : Math.ceil(frameCount / framesPerPeak);
	const data = new Float32Array(channels * peakCount * 2);

	for (let ch = 0; ch < channels; ch += 1) {
		const samples = channelArrays[ch] ?? new Float32Array(0);
		const base = ch * peakCount * 2;
		for (let peak = 0; peak < peakCount; peak += 1) {
			const start = peak * framesPerPeak;
			const end = Math.min(frameCount, start + framesPerPeak);
			let min = 1;
			let max = -1;
			if (start >= end) {
				min = 0;
				max = 0;
			} else {
				for (let i = start; i < end; i += 1) {
					const sample = samples[i] ?? 0;
					if (sample < min) min = sample;
					if (sample > max) max = sample;
				}
			}
			const offset = base + peak * 2;
			data[offset] = min;
			data[offset + 1] = max;
		}
	}

	return { channels, peakCount, framesPerPeak, data };
}

/** Read min/max for one peak from planar data. */
export function readPeak(
	data: Float32Array,
	channels: number,
	peakCount: number,
	channel: number,
	peakIndex: number
): { min: number; max: number } {
	if (channel < 0 || channel >= channels || peakIndex < 0 || peakIndex >= peakCount) {
		return { min: 0, max: 0 };
	}
	const offset = channel * peakCount * 2 + peakIndex * 2;
	return { min: data[offset] ?? 0, max: data[offset + 1] ?? 0 };
}

/**
 * Merge adjacent peaks into a coarser overview for a visible window.
 * Returns planar min/max for `outPeakCount` buckets covering [startPeak, endPeak).
 */
export function resamplePeaksWindow(
	data: Float32Array,
	channels: number,
	peakCount: number,
	startPeak: number,
	endPeak: number,
	outPeakCount: number
): Float32Array {
	const start = Math.max(0, Math.min(peakCount, Math.floor(startPeak)));
	const end = Math.max(start, Math.min(peakCount, Math.ceil(endPeak)));
	const span = Math.max(1, end - start);
	const columns = Math.max(1, Math.floor(outPeakCount));
	const out = new Float32Array(channels * columns * 2);

	for (let ch = 0; ch < channels; ch += 1) {
		const outBase = ch * columns * 2;
		for (let col = 0; col < columns; col += 1) {
			const a = start + Math.floor((col * span) / columns);
			const b = start + Math.floor(((col + 1) * span) / columns);
			let min = 1;
			let max = -1;
			const from = a;
			const to = Math.max(a + 1, b);
			for (let p = from; p < to && p < end; p += 1) {
				const { min: pMin, max: pMax } = readPeak(data, channels, peakCount, ch, p);
				if (pMin < min) min = pMin;
				if (pMax > max) max = pMax;
			}
			if (max < min) {
				min = 0;
				max = 0;
			}
			out[outBase + col * 2] = min;
			out[outBase + col * 2 + 1] = max;
		}
	}

	return out;
}

/**
 * True when the overview peak array is coarser than one peak per draw column
 * for the current view span — zoom has stretched buckets into blocky stairs.
 */
export function needsDetailPeaks(
	peakCount: number,
	viewSpan: number,
	columns: number
): boolean {
	if (!(peakCount > 0) || !(columns > 0)) return false;
	const span = Math.min(1, Math.max(0, viewSpan));
	const visiblePeaks = peakCount * span;
	return visiblePeaks < columns;
}

/**
 * Sample-accurate min/max peaks for a PCM frame window into `outPeakCount` columns.
 * Same truthfulness rules as {@link computePeaksPlanar} (preserve extremes; no averaging).
 */
export function computePeaksWindowFromPlanar(
	channels: Float32Array[],
	startFrame: number,
	endFrame: number,
	outPeakCount: number
): Float32Array {
	const channelCount = channels.length;
	const columns = Math.max(1, Math.floor(outPeakCount));
	const frameCount = channels[0]?.length ?? 0;
	const start = Math.max(0, Math.min(frameCount, Math.floor(startFrame)));
	const end = Math.max(start, Math.min(frameCount, Math.ceil(endFrame)));
	const span = Math.max(1, end - start);
	const out = new Float32Array(channelCount * columns * 2);

	for (let ch = 0; ch < channelCount; ch += 1) {
		const samples = channels[ch] ?? new Float32Array(0);
		const outBase = ch * columns * 2;
		for (let col = 0; col < columns; col += 1) {
			const a = start + Math.floor((col * span) / columns);
			const b = start + Math.floor(((col + 1) * span) / columns);
			let min = 1;
			let max = -1;
			const to = Math.max(a + 1, b);
			for (let i = a; i < to && i < end; i += 1) {
				const sample = samples[i] ?? 0;
				if (sample < min) min = sample;
				if (sample > max) max = sample;
			}
			if (max < min) {
				min = 0;
				max = 0;
			}
			out[outBase + col * 2] = min;
			out[outBase + col * 2 + 1] = max;
		}
	}

	return out;
}
