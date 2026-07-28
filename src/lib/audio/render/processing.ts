import type { EditRecipeProcessing, HighPassHz } from '$lib/domain/types';

function dbToLinear(db: number): number {
	return Math.pow(10, db / 20);
}

/** Butterworth-like 2nd-order high-pass (RBJ biquad, Q ≈ 0.707). */
export function applyHighPassInPlace(
	channels: Float32Array[],
	sampleRate: number,
	cutoffHz: HighPassHz
): void {
	if (cutoffHz <= 0 || channels.length === 0) return;
	const frameCount = channels[0]?.length ?? 0;
	if (frameCount === 0) return;

	const w0 = (2 * Math.PI * cutoffHz) / sampleRate;
	const cosW0 = Math.cos(w0);
	const sinW0 = Math.sin(w0);
	const alpha = sinW0 / (2 * 0.707106781);
	const a0 = 1 + alpha;
	const b0 = (1 + cosW0) / 2 / a0;
	const b1 = -(1 + cosW0) / a0;
	const b2 = b0;
	const a1 = (-2 * cosW0) / a0;
	const a2 = (1 - alpha) / a0;

	for (const channel of channels) {
		let x1 = 0;
		let x2 = 0;
		let y1 = 0;
		let y2 = 0;
		for (let i = 0; i < frameCount; i += 1) {
			const x0 = channel[i] ?? 0;
			const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
			channel[i] = y0;
			x2 = x1;
			x1 = x0;
			y2 = y1;
			y1 = y0;
		}
	}
}

/**
 * Simple downward expander gate: attenuates samples when envelope is below threshold.
 * Attack/release smooth the envelope follower (field-recording friendly defaults).
 */
export function applyNoiseGateInPlace(
	channels: Float32Array[],
	sampleRate: number,
	thresholdDbfs: number,
	attackMs = 15,
	releaseMs = 80
): void {
	const frameCount = channels[0]?.length ?? 0;
	if (frameCount === 0) return;

	const threshold = dbToLinear(thresholdDbfs);
	const attackCoeff = Math.exp(-1 / Math.max(1, (attackMs / 1000) * sampleRate));
	const releaseCoeff = Math.exp(-1 / Math.max(1, (releaseMs / 1000) * sampleRate));
	const floorGain = 0.02;

	let envelope = 0;
	for (let i = 0; i < frameCount; i += 1) {
		let peak = 0;
		for (const channel of channels) {
			peak = Math.max(peak, Math.abs(channel[i] ?? 0));
		}
		const coeff = peak > envelope ? attackCoeff : releaseCoeff;
		envelope = coeff * envelope + (1 - coeff) * peak;

		let gain = 1;
		if (envelope < threshold) {
			const ratio = envelope / Math.max(threshold, 1e-12);
			gain = floorGain + (1 - floorGain) * ratio * ratio;
		}

		for (const channel of channels) {
			channel[i] = (channel[i] ?? 0) * gain;
		}
	}
}

/** Soft-clip peaks to ceiling (tanh knee — audible on hot material after normalize). */
export function applySoftLimitInPlace(channels: Float32Array[], ceilingDbfs: number): void {
	const ceiling = dbToLinear(ceilingDbfs);
	if (ceiling <= 0) return;
	const knee = ceiling * 0.85;

	for (const channel of channels) {
		for (let i = 0; i < channel.length; i += 1) {
			const sample = channel[i] ?? 0;
			const abs = Math.abs(sample);
			if (abs <= knee) continue;
			const sign = sample < 0 ? -1 : 1;
			const excess = abs - knee;
			const compressed =
				knee + Math.tanh(excess / Math.max(ceiling - knee, 1e-6)) * (ceiling - knee);
			channel[i] = sign * Math.min(compressed, ceiling);
		}
	}
}

export function applyRecipeProcessingInPlace(
	channels: Float32Array[],
	sampleRate: number,
	processing: EditRecipeProcessing | undefined
): void {
	if (!processing) return;
	if (processing.highPassHz > 0) {
		applyHighPassInPlace(channels, sampleRate, processing.highPassHz);
	}
	if (processing.gateEnabled) {
		applyNoiseGateInPlace(channels, sampleRate, processing.gateThresholdDbfs);
	}
}
