import type { EditRecipe, RetainedSegment } from '$lib/domain/types';
import { recipeDurationSeconds, segmentDurationSeconds } from '$lib/domain/edit-recipe';
import type { DecodedPlanarAudio } from '$lib/audio/decode';
import { createAppError } from '$lib/domain/ids';

function dbToLinear(db: number): number {
	return Math.pow(10, db / 20);
}

function linearFadeGain(
	frameIndex: number,
	frameCount: number,
	fadeInFrames: number,
	fadeOutFrames: number
): number {
	let gain = 1;
	if (fadeInFrames > 0 && frameIndex < fadeInFrames) {
		gain *= frameIndex / fadeInFrames;
	}
	if (fadeOutFrames > 0 && frameIndex >= frameCount - fadeOutFrames) {
		const remaining = frameCount - 1 - frameIndex;
		gain *= fadeOutFrames <= 1 ? 0 : remaining / (fadeOutFrames - 1);
	}
	return Math.max(0, Math.min(1, gain));
}

function sampleAt(channel: Float32Array, frame: number, frameCount: number): number {
	if (frame < 0 || frame >= frameCount) return 0;
	return channel[frame] ?? 0;
}

/**
 * Deterministic PCM render of an edit recipe.
 * Source PCM is never mutated; output is a new planar buffer.
 */
export function renderRecipePlanar(
	source: DecodedPlanarAudio,
	recipe: EditRecipe
): DecodedPlanarAudio {
	if (recipe.segments.length === 0) {
		throw createAppError('EDIT_EMPTY', 'Edit recipe has no retained audio.', {
			recoverable: true
		});
	}

	const { sampleRate, channelCount } = source;
	const outputDuration = recipeDurationSeconds(recipe);
	const frameCount = Math.max(1, Math.round(outputDuration * sampleRate));
	const channels = Array.from({ length: channelCount }, () => new Float32Array(frameCount));

	let writeFrame = 0;
	for (const segment of recipe.segments) {
		writeFrame = writeSegment(source, segment, channels, writeFrame);
	}

	if (recipe.peakNormalization?.enabled) {
		const peak = measurePeak(channels);
		if (peak > 0) {
			const targetLinear = dbToLinear(recipe.peakNormalization.targetDbfs);
			const normalizeGain = targetLinear / peak;
			for (const channel of channels) {
				for (let i = 0; i < channel.length; i += 1) {
					channel[i] = (channel[i] ?? 0) * normalizeGain;
				}
			}
		}
	}

	return {
		channels,
		frameCount,
		durationSeconds: frameCount / sampleRate,
		channelCount,
		sampleRate
	};
}

function writeSegment(
	source: DecodedPlanarAudio,
	segment: RetainedSegment,
	output: Float32Array[],
	writeFrame: number
): number {
	const lengthSeconds = segmentDurationSeconds(segment);
	const frames = Math.max(0, Math.round(lengthSeconds * source.sampleRate));
	const startFrame = Math.round(segment.sourceStartSeconds * source.sampleRate);
	const segmentGain = dbToLinear(segment.gainDb);
	const fadeInFrames = Math.round(segment.fadeInSeconds * source.sampleRate);
	const fadeOutFrames = Math.round(segment.fadeOutSeconds * source.sampleRate);

	for (let i = 0; i < frames; i += 1) {
		const outIndex = writeFrame + i;
		if (outIndex >= (output[0]?.length ?? 0)) break;
		const fade = linearFadeGain(i, frames, fadeInFrames, fadeOutFrames);
		const gain = segmentGain * fade;
		const srcFrame = startFrame + i;
		for (let ch = 0; ch < source.channelCount; ch += 1) {
			const src = source.channels[ch];
			const dest = output[ch];
			if (!src || !dest) continue;
			dest[outIndex] = sampleAt(src, srcFrame, source.frameCount) * gain;
		}
	}

	return writeFrame + frames;
}

function measurePeak(channels: Float32Array[]): number {
	let peak = 0;
	for (const channel of channels) {
		for (let i = 0; i < channel.length; i += 1) {
			const abs = Math.abs(channel[i] ?? 0);
			if (abs > peak) peak = abs;
		}
	}
	return peak;
}

/** Linear gain applied by peak normalization (1 when disabled or peak is zero). */
export function recipeNormalizeGainLinear(source: DecodedPlanarAudio, recipe: EditRecipe): number {
	if (!recipe.peakNormalization?.enabled) return 1;
	const peak = measureRecipePeak(source, recipe);
	if (peak <= 0) return 1;
	return dbToLinear(recipe.peakNormalization.targetDbfs) / peak;
}

/** Peak of rendered output before peak-normalization gain. */
export function measureRecipePeak(source: DecodedPlanarAudio, recipe: EditRecipe): number {
	const withoutNorm: EditRecipe = {
		version: 1,
		segments: recipe.segments.map((segment) => ({ ...segment }))
	};
	const rendered = renderRecipePlanar(source, withoutNorm);
	return measurePeak(rendered.channels);
}

/** Attach calculated normalize gain after measuring retained peak. */
export function withCalculatedNormalization(recipe: EditRecipe, peak: number): EditRecipe {
	if (!recipe.peakNormalization?.enabled || peak <= 0) {
		return {
			version: 1,
			segments: recipe.segments.map((segment) => ({ ...segment })),
			peakNormalization: recipe.peakNormalization ? { ...recipe.peakNormalization } : undefined
		};
	}
	const targetLinear = dbToLinear(recipe.peakNormalization.targetDbfs);
	const gain = targetLinear / peak;
	return {
		version: 1,
		segments: recipe.segments.map((segment) => ({ ...segment })),
		peakNormalization: {
			...recipe.peakNormalization,
			calculatedGainDb: 20 * Math.log10(gain)
		}
	};
}

function getAudioContextCtor(): typeof AudioContext | undefined {
	if (typeof window === 'undefined') return undefined;
	return (
		window.AudioContext ||
		(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
	);
}

/** Build an AudioBuffer from planar PCM for Web Audio preview. */
export function planarToAudioBuffer(planar: DecodedPlanarAudio): AudioBuffer {
	const AudioContextCtor = getAudioContextCtor();
	if (!AudioContextCtor) {
		throw createAppError('WEBAUDIO_UNSUPPORTED', 'Web Audio is unavailable for preview.', {
			recoverable: true
		});
	}
	const context = new AudioContextCtor({ sampleRate: planar.sampleRate });
	try {
		const buffer = context.createBuffer(planar.channelCount, planar.frameCount, planar.sampleRate);
		for (let ch = 0; ch < planar.channelCount; ch += 1) {
			const channel = planar.channels[ch] ?? new Float32Array(planar.frameCount);
			buffer.copyToChannel(channel as Float32Array<ArrayBuffer>, ch);
		}
		return buffer;
	} finally {
		void context.close().catch(() => undefined);
	}
}
