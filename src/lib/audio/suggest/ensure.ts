import {
	SUGGEST_REGIONS_ALGORITHM_VERSION,
	SUGGEST_REGIONS_MIN_DURATION_SECONDS
} from '$lib/config/suggest-regions';
import {
	isSuggestAutoDisabledForSession,
	noteSuggestAutoAnalysisDuration
} from '$lib/audio/suggest/auto-budget';
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
	/**
	 * Auto-run skipped because this browser session already exceeded the
	 * typical analysis budget (manual Analyze still available).
	 */
	autoSkipped?: boolean;
	/** Analysis wall time when a fresh compute ran (not cache). */
	elapsedMs?: number;
}

export function isEligibleForSuggestedRegions(durationSeconds: number): boolean {
	return Number.isFinite(durationSeconds) && durationSeconds > SUGGEST_REGIONS_MIN_DURATION_SECONDS;
}

/**
 * Load cached Suggested Regions or analyze PCM and persist.
 * Pass `force` to recompute (manual Analyze) — bypasses session auto-disable.
 * Optional `pcm` avoids a second decode when the take editor already has planar audio.
 * Optional `signal` cancels in-flight analysis (navigate away).
 */
export async function ensureSuggestedRegionsForTake(
	take: Take,
	options?: {
		force?: boolean;
		pcm?: DecodedPlanarAudio | null;
		signal?: AbortSignal;
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

	if (options?.signal?.aborted) {
		throw new DOMException('Suggest-regions analysis aborted', 'AbortError');
	}

	const force = options?.force === true;

	if (!force) {
		const cached = await getSuggestedRegions(take.id);
		if (isSuggestedRegionsCacheFresh(cached, take)) {
			return {
				regions: cached.regions,
				algorithmVersion: cached.algorithmVersion,
				fromCache: true
			};
		}

		if (isSuggestAutoDisabledForSession()) {
			return {
				regions: [],
				algorithmVersion: SUGGEST_REGIONS_ALGORITHM_VERSION,
				fromCache: false,
				autoSkipped: true
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
		if (options?.signal?.aborted) {
			throw new DOMException('Suggest-regions analysis aborted', 'AbortError');
		}
		pcm = await decodeAudioPlanar(file, take.source.mimeType);
	}

	if (pcm.frameCount <= 0 || pcm.channels.length === 0) {
		throw createAppError('SUGGEST_EMPTY_AUDIO', 'Decoded audio had no samples to analyze.', {
			recoverable: true,
			context: { takeId: take.id }
		});
	}

	if (options?.signal?.aborted) {
		throw new DOMException('Suggest-regions analysis aborted', 'AbortError');
	}

	const analyzed = await suggestRegionsAsync(
		pcm.channels,
		pcm.sampleRate,
		pcm.durationSeconds || duration,
		{ signal: options?.signal }
	);

	if (!force) {
		noteSuggestAutoAnalysisDuration(analyzed.elapsedMs);
		if (import.meta.env.DEV) {
			console.debug(
				`[SampleScout] suggest-regions analysis ${analyzed.elapsedMs.toFixed(0)}ms` +
					(isSuggestAutoDisabledForSession() ? ' (auto disabled for session)' : '')
			);
		}
	}

	await saveSuggestedRegionsForTake(take, analyzed.regions, analyzed.algorithmVersion);

	return {
		regions: analyzed.regions,
		algorithmVersion: analyzed.algorithmVersion,
		fromCache: false,
		elapsedMs: analyzed.elapsedMs
	};
}

export { isSuggestAutoDisabledForSession };
