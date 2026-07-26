import type { OutputSettings } from '$lib/domain/types';
import { wavByteLength, type WavBitDepth } from './wav';

export type Mp3BitrateKbps = 96 | 128 | 192;

/** Estimated MP3 payload size from duration and CBR bitrate (container overhead ignored). */
export function estimateMp3ByteLength(
	durationSeconds: number,
	bitrateKbps: Mp3BitrateKbps
): number {
	if (durationSeconds <= 0) return 0;
	return Math.round((durationSeconds * bitrateKbps * 1000) / 8);
}

/** File-size estimate for the take output settings and rendered duration. */
export function estimateEncodedByteLength(
	durationSeconds: number,
	channelCount: number,
	sampleRate: number,
	output: OutputSettings
): number | null {
	if (output.format === 'source') return null;
	if (durationSeconds <= 0 || channelCount <= 0 || sampleRate <= 0) return 0;

	if (output.format === 'wav') {
		const frames = Math.max(1, Math.round(durationSeconds * sampleRate));
		return wavByteLength(frames, channelCount, output.bitDepth as WavBitDepth);
	}

	return estimateMp3ByteLength(durationSeconds, output.bitrateKbps);
}

/** Human-readable size for estimates (binary KiB/MiB). */
export function formatByteEstimate(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}
