/** Pure RMS envelope + adaptive threshold helpers. */

export function monoDownmix(channels: Float32Array[]): Float32Array {
	if (channels.length === 0) return new Float32Array(0);
	const primary = channels[0];
	if (!primary) return new Float32Array(0);
	if (channels.length === 1) return primary;

	const frameCount = primary.length;
	const out = new Float32Array(frameCount);
	const channelCount = channels.length;
	for (let i = 0; i < frameCount; i += 1) {
		let sum = 0;
		for (let ch = 0; ch < channelCount; ch += 1) {
			sum += channels[ch]?.[i] ?? 0;
		}
		out[i] = sum / channelCount;
	}
	return out;
}

export function computeRmsEnvelope(
	mono: Float32Array,
	sampleRate: number,
	hopSeconds: number
): { envelope: Float32Array; hopFrames: number } {
	const hopFrames = Math.max(1, Math.round(sampleRate * hopSeconds));
	const frameCount = mono.length === 0 ? 0 : Math.ceil(mono.length / hopFrames);
	const envelope = new Float32Array(frameCount);
	for (let frame = 0; frame < frameCount; frame += 1) {
		const start = frame * hopFrames;
		const end = Math.min(mono.length, start + hopFrames);
		let sum = 0;
		for (let i = start; i < end; i += 1) {
			const sample = mono[i] ?? 0;
			sum += sample * sample;
		}
		envelope[frame] = Math.sqrt(sum / Math.max(1, end - start));
	}
	return { envelope, hopFrames };
}

/** `sorted` must already be ascending. `p` in [0, 1]. */
export function percentileSorted(sorted: Float32Array, p: number): number {
	if (sorted.length === 0) return 0;
	const clamped = Math.min(1, Math.max(0, p));
	const index = Math.min(sorted.length - 1, Math.floor(clamped * (sorted.length - 1)));
	return sorted[index] ?? 0;
}

export function adaptiveEnergyThreshold(
	envelope: Float32Array,
	noisePercentile: number,
	peakPercentile: number
): number {
	if (envelope.length === 0) return 1;
	const sorted = Float32Array.from(envelope);
	sorted.sort();
	const floor = percentileSorted(sorted, noisePercentile);
	const peak = percentileSorted(sorted, peakPercentile);
	const span = Math.max(0, peak - floor);
	const margin = Math.max(floor * 3, span * 0.15, 1e-4);
	return floor + margin;
}
