export interface SuggestedRegion {
	startSeconds: number;
	endSeconds: number;
}

export interface SuggestRegionsInput {
	channels: Float32Array[];
	sampleRate: number;
	/** Optional override; defaults to frameCount / sampleRate. */
	durationSeconds?: number;
}

export interface SuggestRegionsResult {
	regions: SuggestedRegion[];
	algorithmVersion: number;
}
