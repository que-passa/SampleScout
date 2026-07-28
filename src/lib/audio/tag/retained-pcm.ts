import { isIdentityRecipe, recipeDurationSeconds } from '$lib/domain/edit-recipe';
import type { EditRecipe } from '$lib/domain/types';
import type { DecodedPlanarAudio } from '$lib/audio/decode';

function clampFrame(frame: number, frameCount: number): number {
	return Math.max(0, Math.min(frameCount, frame));
}

/**
 * PCM span YAMNet should hear: retained source ranges only, without render-time
 * fades/gain/processing (classification cares about content, not export shaping).
 */
export function extractClassificationPcm(
	source: DecodedPlanarAudio,
	recipe: EditRecipe,
	sourceDurationSeconds: number
): DecodedPlanarAudio {
	if (isIdentityRecipe(recipe, sourceDurationSeconds)) {
		return source;
	}

	const { sampleRate, channelCount } = source;
	const sourceFrameCount = source.channels[0]?.length ?? 0;
	if (sourceFrameCount <= 0 || recipe.segments.length === 0) {
		return {
			...source,
			channels: source.channels.map(() => new Float32Array(0)),
			frameCount: 0,
			durationSeconds: 0
		};
	}

	const targetFrameCount = Math.max(1, Math.round(recipeDurationSeconds(recipe) * sampleRate));
	const channels = Array.from({ length: channelCount }, () => new Float32Array(targetFrameCount));

	let writeFrame = 0;
	for (const segment of recipe.segments) {
		const startFrame = clampFrame(
			Math.round(segment.sourceStartSeconds * sampleRate),
			sourceFrameCount
		);
		const endFrame = clampFrame(
			Math.round(segment.sourceEndSeconds * sampleRate),
			sourceFrameCount
		);
		const length = endFrame - startFrame;
		if (length <= 0) continue;

		for (let ch = 0; ch < channelCount; ch += 1) {
			const src = source.channels[ch];
			const dst = channels[ch];
			if (!src || !dst) continue;
			dst.set(src.subarray(startFrame, endFrame), writeFrame);
		}
		writeFrame += length;
	}

	if (writeFrame <= 0) {
		return {
			...source,
			channels: source.channels.map(() => new Float32Array(0)),
			frameCount: 0,
			durationSeconds: 0
		};
	}

	return {
		channelCount,
		sampleRate,
		frameCount: writeFrame,
		durationSeconds: writeFrame / sampleRate,
		channels: channels.map((channel) => channel.subarray(0, writeFrame))
	};
}
