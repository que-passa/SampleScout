import {
	SUGGEST_REGIONS_ALGORITHM_VERSION,
	SUGGEST_REGIONS_MIN_DURATION_SECONDS
} from '$lib/config/suggest-regions';
import { suggestRegionsAsync } from '$lib/audio/suggest/worker-client';
import type { SuggestedRegion } from '$lib/audio/suggest/types';
import { decodeAudioPlanar, type DecodedPlanarAudio } from '$lib/audio/decode';
import { createAppError } from '$lib/domain/ids';
import type { Take } from '$lib/domain/types';
import { readBinary } from '$lib/persistence/opfs';
import {
	getSuggestedRegions,
	isSuggestedRegionsCacheFresh,
	saveSuggestedRegionsForTake
} from '$lib/persistence/suggested-regions';

export interface EnsureSuggestedRegionsResult {
	regions: SuggestedRegion[];
	algorithmVersion: number;
	fromCache: boolean;
}

export function isEligibleForSuggestedRegions(durationSeconds: number): boolean {
	return Number.isFinite(durationSeconds) && durationSeconds > SUGGEST_REGIONS_MIN_DURATION_SECONDS;
}

/**
 * Load cached Suggested Regions or analyze PCM and persist.
 * Pass `force` to recompute (manual Analyze).
 * Optional `pcm` avoids a second decode when the take editor already has planar audio.
 */
export async function ensureSuggestedRegionsForTake(
	take: Take,
	options?: {
		force?: boolean;
		pcm?: DecodedPlanarAudio | null;
	}
): Promise<EnsureSuggestedRegionsResult> {
	const duration = take.source.durationSeconds || 0;
	if (!isEligibleForSuggestedRegions(duration)) {
		return {
			regions: [],
			algorithmVersion: SUGGEST_REGIONS_ALGORITHM_VERSION,
			fromCache: false
		};
	}

	if (!options?.force) {
		const cached = await getSuggestedRegions(take.id);
		if (isSuggestedRegionsCacheFresh(cached, take)) {
			return {
				regions: cached.regions,
				algorithmVersion: cached.algorithmVersion,
				fromCache: true
			};
		}
	}

	if (!take.source.fileRef) {
		throw createAppError('SUGGEST_NO_SOURCE', 'Take has no source file to analyze.', {
			recoverable: true,
			context: { takeId: take.id }
		});
	}

	let pcm = options?.pcm ?? null;
	if (!pcm || pcm.frameCount <= 0) {
		const file = await readBinary(take.source.fileRef);
		pcm = await decodeAudioPlanar(file, take.source.mimeType);
	}

	if (pcm.frameCount <= 0 || pcm.channels.length === 0) {
		throw createAppError('SUGGEST_EMPTY_AUDIO', 'Decoded audio had no samples to analyze.', {
			recoverable: true,
			context: { takeId: take.id }
		});
	}

	const analyzed = await suggestRegionsAsync(
		pcm.channels,
		pcm.sampleRate,
		pcm.durationSeconds || duration
	);
	await saveSuggestedRegionsForTake(take, analyzed.regions, analyzed.algorithmVersion);

	return {
		regions: analyzed.regions,
		algorithmVersion: analyzed.algorithmVersion,
		fromCache: false
	};
}
