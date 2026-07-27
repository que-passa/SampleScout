import {
	SUGGEST_REGIONS_ALGORITHM_VERSION,
	SUGGEST_REGIONS_BACKTRACK_SECONDS,
	SUGGEST_REGIONS_HOP_SECONDS,
	SUGGEST_REGIONS_MAX_COUNT,
	SUGGEST_REGIONS_MAX_REGION_SECONDS,
	SUGGEST_REGIONS_MIN_REGION_SECONDS,
	SUGGEST_REGIONS_MIN_SILENCE_SECONDS,
	SUGGEST_REGIONS_NEAR_FULL_FRACTION,
	SUGGEST_REGIONS_NOISE_PERCENTILE,
	SUGGEST_REGIONS_PAD_POST_SECONDS,
	SUGGEST_REGIONS_PAD_PRE_SECONDS,
	SUGGEST_REGIONS_PEAK_PERCENTILE
} from '$lib/config/suggest-regions';
import {
	adaptiveEnergyThreshold,
	computeRmsEnvelope,
	monoDownmix
} from './envelope';
import { findEnergyIslands, islandsToRegions, mergeCloseIslands } from './segment';
import type { SuggestRegionsInput, SuggestRegionsResult } from './types';

/**
 * Adaptive energy-island segmentation with start backtrack.
 * Pure / sync — safe for Worker and main-thread fallback.
 */
export function suggestRegionsFromPlanar(input: SuggestRegionsInput): SuggestRegionsResult {
	const sampleRate = input.sampleRate;
	if (!Number.isFinite(sampleRate) || sampleRate <= 0 || input.channels.length === 0) {
		return { regions: [], algorithmVersion: SUGGEST_REGIONS_ALGORITHM_VERSION };
	}

	const mono = monoDownmix(input.channels);
	const frameCount = mono.length;
	const durationSeconds =
		input.durationSeconds ?? (frameCount > 0 ? frameCount / sampleRate : 0);
	if (durationSeconds <= 0 || frameCount === 0) {
		return { regions: [], algorithmVersion: SUGGEST_REGIONS_ALGORITHM_VERSION };
	}

	const { envelope, hopFrames } = computeRmsEnvelope(mono, sampleRate, SUGGEST_REGIONS_HOP_SECONDS);
	if (envelope.length === 0) {
		return { regions: [], algorithmVersion: SUGGEST_REGIONS_ALGORITHM_VERSION };
	}

	const threshold = adaptiveEnergyThreshold(
		envelope,
		SUGGEST_REGIONS_NOISE_PERCENTILE,
		SUGGEST_REGIONS_PEAK_PERCENTILE
	);
	const mask = new Uint8Array(envelope.length);
	for (let i = 0; i < envelope.length; i += 1) {
		mask[i] = (envelope[i] ?? 0) >= threshold ? 1 : 0;
	}

	const minSilenceFrames = Math.max(
		1,
		Math.round((SUGGEST_REGIONS_MIN_SILENCE_SECONDS * sampleRate) / hopFrames)
	);
	const backtrackFrames = Math.max(
		1,
		Math.round((SUGGEST_REGIONS_BACKTRACK_SECONDS * sampleRate) / hopFrames)
	);

	const islands = mergeCloseIslands(findEnergyIslands(mask), minSilenceFrames);
	const regions = islandsToRegions(islands, hopFrames, sampleRate, durationSeconds, {
		padPreSeconds: SUGGEST_REGIONS_PAD_PRE_SECONDS,
		padPostSeconds: SUGGEST_REGIONS_PAD_POST_SECONDS,
		backtrackFrames,
		minRegionSeconds: SUGGEST_REGIONS_MIN_REGION_SECONDS,
		maxRegionSeconds: SUGGEST_REGIONS_MAX_REGION_SECONDS,
		nearFullFraction: SUGGEST_REGIONS_NEAR_FULL_FRACTION,
		maxCount: SUGGEST_REGIONS_MAX_COUNT,
		envelope
	});

	return { regions, algorithmVersion: SUGGEST_REGIONS_ALGORITHM_VERSION };
}
