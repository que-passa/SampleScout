import { AUDIO_TAG_ALGORITHM_VERSION, YAMNET_MIN_DURATION_SECONDS } from '$lib/config/audio-tags';
import { classifyPlanarAudio } from './classify';
import { decodeAudioPlanar, type DecodedPlanarAudio } from '$lib/audio/decode';
import { extractClassificationPcm } from './retained-pcm';
import { applyGeneratedTags, canApplyGeneratedTags } from '$lib/domain/metadata';
import { createAppError } from '$lib/domain/ids';
import type { Take } from '$lib/domain/types';
import { readBinary } from '$lib/persistence/opfs';
import { getTake, updateTake } from '$lib/persistence/takes';

export interface EnsureGeneratedTagsResult {
	applied: boolean;
	tags: string[];
	fromCache: boolean;
}

export function isEligibleForGeneratedTags(durationSeconds: number): boolean {
	return Number.isFinite(durationSeconds) && durationSeconds >= YAMNET_MIN_DURATION_SECONDS;
}

/**
 * Analyze audio with YAMNet and write tags when Field Notes tags are still generic defaults.
 * Re-reads the take before persisting so manual edits win any race.
 */
export async function ensureGeneratedTagsForTake(
	take: Take,
	options?: { pcm?: DecodedPlanarAudio | null; force?: boolean }
): Promise<EnsureGeneratedTagsResult> {
	if (take.lifecycleState !== 'saved' || !take.source.fileRef) {
		return { applied: false, tags: take.metadata.tags, fromCache: true };
	}

	let pcm = options?.pcm ?? null;
	if (!pcm || pcm.frameCount <= 0) {
		const file = await readBinary(take.source.fileRef);
		pcm = await decodeAudioPlanar(file, take.source.mimeType);
	}

	const classificationPcm = extractClassificationPcm(
		pcm,
		take.editRecipe,
		take.source.durationSeconds
	);

	if (!isEligibleForGeneratedTags(classificationPcm.durationSeconds)) {
		return { applied: false, tags: take.metadata.tags, fromCache: true };
	}

	if (!canApplyGeneratedTags(take.metadata, { force: options?.force })) {
		return { applied: false, tags: take.metadata.tags, fromCache: true };
	}

	if (classificationPcm.frameCount <= 0 || classificationPcm.channels.length === 0) {
		throw createAppError('TAG_EMPTY_AUDIO', 'Decoded audio had no samples to classify.', {
			recoverable: true,
			context: { takeId: take.id }
		});
	}

	const classified = await classifyPlanarAudio(
		classificationPcm.channels,
		classificationPcm.sampleRate
	);
	const fresh = await getTake(take.id);
	if (!fresh || fresh.lifecycleState !== 'saved') {
		return { applied: false, tags: classified.tags, fromCache: false };
	}

	if (!canApplyGeneratedTags(fresh.metadata, { force: options?.force })) {
		return { applied: false, tags: fresh.metadata.tags, fromCache: false };
	}

	const nextMetadata = applyGeneratedTags(
		fresh.metadata,
		classified.tags,
		AUDIO_TAG_ALGORITHM_VERSION
	);
	if (!nextMetadata) {
		return { applied: false, tags: fresh.metadata.tags, fromCache: false };
	}

	await updateTake({ ...fresh, metadata: nextMetadata });
	return { applied: true, tags: nextMetadata.tags, fromCache: false };
}
