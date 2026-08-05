/** Tunable defaults for Suggested Regions (energy-island analysis). */

/** Algorithm version — bump when defaults/logic change enough to invalidate IDB cache. */
export const SUGGEST_REGIONS_ALGORITHM_VERSION = 1;

/** Auto/manual Analyze only when source duration exceeds this (seconds). */
export const SUGGEST_REGIONS_MIN_DURATION_SECONDS = 3;

/** RMS envelope hop length. */
export const SUGGEST_REGIONS_HOP_SECONDS = 0.015;

/** Ignore islands shorter than this after padding. */
export const SUGGEST_REGIONS_MIN_REGION_SECONDS = 0.1;

/** Cap very long islands (textures); tune on devices. */
export const SUGGEST_REGIONS_MAX_REGION_SECONDS = 20;

/** Merge islands separated by less than this much silence. */
export const SUGGEST_REGIONS_MIN_SILENCE_SECONDS = 0.25;

/** Pad kept before detected energy start / after end. */
export const SUGGEST_REGIONS_PAD_PRE_SECONDS = 0.04;
export const SUGGEST_REGIONS_PAD_POST_SECONDS = 0.1;

/** Max look-back when backtracking start to a local energy minimum. */
export const SUGGEST_REGIONS_BACKTRACK_SECONDS = 0.1;

/** Hard cap on returned regions (time order; drop overflow). */
export const SUGGEST_REGIONS_MAX_COUNT = 24;

/**
 * If a single region covers at least this fraction of the take, treat as
 * non-useful (near-full-file) and return empty.
 */
export const SUGGEST_REGIONS_NEAR_FULL_FRACTION = 0.9;

/** Percentile of envelope used as noise-floor estimate. */
export const SUGGEST_REGIONS_NOISE_PERCENTILE = 0.2;

/** High percentile used when deriving adaptive threshold margin. */
export const SUGGEST_REGIONS_PEAK_PERCENTILE = 0.95;

/** Worker / sync analysis hard timeout (stuck-work kill-switch). */
export const SUGGEST_REGIONS_TIMEOUT_MS = 12_000;

/**
 * Typical Worker analysis budget for auto-run on take open.
 * Exceeding this once disables auto Suggest for the rest of the browser session;
 * Manual Analyze remains available when the duration gate passes.
 * Independent of {@link SUGGEST_REGIONS_TIMEOUT_MS}.
 */
export const SUGGEST_REGIONS_AUTO_BUDGET_MS = 300;
