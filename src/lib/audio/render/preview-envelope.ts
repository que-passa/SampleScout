import type { EditRecipe, RetainedSegment } from '$lib/domain/types';
import type { DecodedPlanarAudio } from '$lib/audio/decode';
import { renderRecipePlanar } from '$lib/audio/render';

let cachedEnvelopeKey: string | null = null;
let cachedEnvelope: Float32Array | null = null;

function envelopeCacheKey(
	source: DecodedPlanarAudio,
	recipe: EditRecipe,
	bucketCount: number
): string {
	return JSON.stringify({
		frameCount: source.frameCount,
		sampleRate: source.sampleRate,
		bucketCount,
		recipe
	});
}

function measureRangePeak(channels: Float32Array[], start: number, end: number): number {
	let peak = 0;
	for (const channel of channels) {
		const last = Math.min(end, channel.length);
		for (let i = start; i < last; i += 1) {
			peak = Math.max(peak, Math.abs(channel[i] ?? 0));
		}
	}
	return peak;
}

function sortedSegments(recipe: EditRecipe): RetainedSegment[] {
	return [...recipe.segments].sort(
		(a, b) => a.sourceStartSeconds - b.sourceStartSeconds || a.sourceEndSeconds - b.sourceEndSeconds
	);
}

/** Map a source frame index to edited output frame index, or null when discarded. */
function mapSourceFrameToEdited(
	segments: RetainedSegment[],
	sampleRate: number,
	sourceFrame: number
): number | null {
	let edited = 0;
	for (const segment of segments) {
		const segStart = Math.round(segment.sourceStartSeconds * sampleRate);
		const segEnd = Math.round(segment.sourceEndSeconds * sampleRate);
		if (sourceFrame < segStart) return null;
		if (sourceFrame < segEnd) {
			return edited + (sourceFrame - segStart);
		}
		edited += Math.max(0, segEnd - segStart);
	}
	return null;
}

function mapSourceRangeToEdited(
	segments: RetainedSegment[],
	sampleRate: number,
	srcStart: number,
	srcEnd: number
): { editedStart: number; editedEnd: number } | null {
	const startMapped = mapSourceFrameToEdited(segments, sampleRate, srcStart);
	if (startMapped == null) return null;
	let editedStart = startMapped;
	let editedEnd = startMapped;
	for (let frame = srcStart; frame < srcEnd; frame += 1) {
		const mapped = mapSourceFrameToEdited(segments, sampleRate, frame);
		if (mapped == null) continue;
		editedStart = Math.min(editedStart, mapped);
		editedEnd = Math.max(editedEnd, mapped + 1);
	}
	if (editedEnd <= editedStart) return null;
	return { editedStart, editedEnd };
}

/**
 * Per-overview-bucket gain multipliers after applying the full edit recipe.
 * Maps source timeline buckets to rendered output for honest gate/HPF/limit preview.
 */
export function buildProcessingPreviewEnvelope(
	source: DecodedPlanarAudio,
	recipe: EditRecipe,
	durationSeconds: number,
	bucketCount: number
): Float32Array {
	const envelope = new Float32Array(Math.max(1, bucketCount));
	envelope.fill(1);
	if (!(durationSeconds > 0) || bucketCount <= 0) return envelope;

	const key = envelopeCacheKey(source, recipe, bucketCount);
	if (cachedEnvelopeKey === key && cachedEnvelope?.length === envelope.length) {
		envelope.set(cachedEnvelope);
		return envelope;
	}

	const rendered = renderRecipePlanar(source, recipe);
	const segments = sortedSegments(recipe);
	const framesPerBucket = source.frameCount / bucketCount;

	for (let bucket = 0; bucket < bucketCount; bucket += 1) {
		const srcStart = Math.floor(bucket * framesPerBucket);
		const srcEnd = Math.floor((bucket + 1) * framesPerBucket);
		if (srcEnd <= srcStart) continue;

		const sourcePeak = measureRangePeak(source.channels, srcStart, srcEnd);
		const mapped = mapSourceRangeToEdited(segments, source.sampleRate, srcStart, srcEnd);
		if (!mapped) continue;

		const editedPeak = measureRangePeak(rendered.channels, mapped.editedStart, mapped.editedEnd);

		if (sourcePeak > 1e-9) {
			envelope[bucket] = editedPeak / sourcePeak;
		}
	}

	cachedEnvelopeKey = key;
	cachedEnvelope = envelope.slice();

	return envelope;
}
