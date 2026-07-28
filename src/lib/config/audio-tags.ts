/** Bump when label mapping or windowing changes — stale generated tags may re-run. */
export const AUDIO_TAG_ALGORITHM_VERSION = 2;

/** YAMNet classification window at 16 kHz (MediaPipe YamNet input). */
export const YAMNET_WINDOW_SAMPLES = 15_600;

export const YAMNET_SAMPLE_RATE = 16_000;

/** Evenly spaced windows across a take (cap keeps mobile inference bounded). */
export const YAMNET_MAX_WINDOWS = 24;

/** Minimum score to promote an AudioSet label to a Field Notes tag. */
export const YAMNET_MIN_SCORE = 0.08;

export const YAMNET_MAX_TAGS = 5;

/** Shorter clips still get one centered window when possible. */
export const YAMNET_MIN_DURATION_SECONDS = 0.4;

export const AUDIO_TAG_TIMEOUT_MS = 120_000;

/** Max parallel tag jobs — keep at 1 so decode + WASM inference stay off the hot path. */
export const AUDIO_TAG_MAX_CONCURRENT = 1;
