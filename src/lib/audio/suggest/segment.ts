import type { SuggestedRegion } from './types';

export interface FrameIsland {
	startFrame: number;
	endFrame: number; // exclusive
}

export function findEnergyIslands(mask: Uint8Array): FrameIsland[] {
	const islands: FrameIsland[] = [];
	let start = -1;
	for (let i = 0; i < mask.length; i += 1) {
		const active = mask[i] === 1;
		if (active && start < 0) start = i;
		if (!active && start >= 0) {
			islands.push({ startFrame: start, endFrame: i });
			start = -1;
		}
	}
	if (start >= 0) {
		islands.push({ startFrame: start, endFrame: mask.length });
	}
	return islands;
}

/** Merge islands whose gap is shorter than `minSilenceFrames`. */
export function mergeCloseIslands(islands: FrameIsland[], minSilenceFrames: number): FrameIsland[] {
	if (islands.length === 0) return [];
	const merged: FrameIsland[] = [];
	let current = { ...islands[0]! };
	for (let i = 1; i < islands.length; i += 1) {
		const next = islands[i]!;
		const gap = next.startFrame - current.endFrame;
		if (gap < minSilenceFrames) {
			current.endFrame = next.endFrame;
		} else {
			merged.push(current);
			current = { ...next };
		}
	}
	merged.push(current);
	return merged;
}

/**
 * Walk backward from `startFrame` within `windowFrames` to the lowest envelope
 * sample (prefer earlier on ties).
 */
export function backtrackToLocalMin(
	envelope: Float32Array,
	startFrame: number,
	windowFrames: number
): number {
	const lo = Math.max(0, startFrame - Math.max(0, windowFrames));
	let best = startFrame;
	let bestValue = envelope[startFrame] ?? Number.POSITIVE_INFINITY;
	for (let i = startFrame; i >= lo; i -= 1) {
		const value = envelope[i] ?? Number.POSITIVE_INFINITY;
		if (value < bestValue) {
			bestValue = value;
			best = i;
		}
	}
	return best;
}

export function islandsToRegions(
	islands: FrameIsland[],
	hopFrames: number,
	sampleRate: number,
	durationSeconds: number,
	options: {
		padPreSeconds: number;
		padPostSeconds: number;
		backtrackFrames: number;
		minRegionSeconds: number;
		maxRegionSeconds: number;
		nearFullFraction: number;
		maxCount: number;
		envelope: Float32Array;
	}
): SuggestedRegion[] {
	if (sampleRate <= 0 || durationSeconds <= 0 || hopFrames <= 0) return [];

	const regions: SuggestedRegion[] = [];
	for (const island of islands) {
		const startFrame = backtrackToLocalMin(
			options.envelope,
			island.startFrame,
			options.backtrackFrames
		);
		const startSeconds = Math.max(0, (startFrame * hopFrames) / sampleRate - options.padPreSeconds);
		const endSeconds = Math.min(
			durationSeconds,
			(island.endFrame * hopFrames) / sampleRate + options.padPostSeconds
		);
		const length = endSeconds - startSeconds;
		if (length < options.minRegionSeconds) continue;
		if (length > options.maxRegionSeconds) {
			// Keep the beginning of a long island as a rough suggestion.
			regions.push({
				startSeconds,
				endSeconds: Math.min(durationSeconds, startSeconds + options.maxRegionSeconds)
			});
			continue;
		}
		regions.push({ startSeconds, endSeconds });
	}

	if (regions.length === 1) {
		const only = regions[0]!;
		if (only.endSeconds - only.startSeconds >= durationSeconds * options.nearFullFraction) {
			return [];
		}
	}

	return regions.slice(0, Math.max(0, options.maxCount));
}
