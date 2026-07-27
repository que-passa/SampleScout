/** Relative silence floor below the loudest channel peak (−80 dB). */
const SILENCE_FLOOR_DB = 1e-4;

export function measureChannelPeak(channel: Float32Array): number {
	let peak = 0;
	for (let i = 0; i < channel.length; i += 1) {
		peak = Math.max(peak, Math.abs(channel[i] ?? 0));
	}
	return peak;
}

/**
 * Detect mono content stored in a multi-channel container (common on iOS:
 * stereo tracks with data on one side only).
 */
export function normalizeChannelLayout(channels: Float32Array[]): {
	channels: Float32Array[];
	channelCount: number;
} {
	if (channels.length === 0) {
		return { channels: [new Float32Array(0)], channelCount: 1 };
	}

	if (channels.length === 1) {
		return { channels, channelCount: 1 };
	}

	const peaks = channels.map(measureChannelPeak);
	const maxPeak = Math.max(...peaks);
	if (maxPeak <= 0) {
		return { channels: [channels[0]!], channelCount: 1 };
	}

	const silenceThreshold = Math.max(1e-8, maxPeak * SILENCE_FLOOR_DB);
	const activeCount = peaks.filter((peak) => peak > silenceThreshold).length;
	if (activeCount > 1) {
		return { channels, channelCount: channels.length };
	}

	let dominantIndex = 0;
	for (let i = 1; i < peaks.length; i += 1) {
		if ((peaks[i] ?? 0) > (peaks[dominantIndex] ?? 0)) {
			dominantIndex = i;
		}
	}

	return {
		channels: [channels[dominantIndex]!],
		channelCount: 1
	};
}
