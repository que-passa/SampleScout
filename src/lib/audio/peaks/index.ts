import { createAppError, nowIso } from '$lib/domain/ids';
import type { PeakAsset, Take } from '$lib/domain/types';
import { decodeAudioPlanar, decodeAudioSummary } from '$lib/audio/decode';
import { peaksPath, updateTake } from '$lib/persistence';
import { readBinary, writeBinary } from '$lib/persistence/opfs';
import { framesPerPeakForLength, TARGET_OVERVIEW_PEAKS, type PeakComputeResult } from './compute';
import { decodePeaksBinary, encodePeaksBinary } from './format';
import { computePeaksAsync } from './worker-client';

export type { PeakComputeInput, PeakComputeResult } from './compute';
export {
	computePeaksPlanar,
	computePeaksWindowFromPlanar,
	framesPerPeakForLength,
	needsDetailPeaks,
	readPeak,
	resamplePeaksWindow,
	TARGET_OVERVIEW_PEAKS
} from './compute';
export { decodePeaksBinary, encodePeaksBinary, PEAKS_FORMAT_VERSION, PEAKS_MAGIC } from './format';
export { computePeaksAsync } from './worker-client';

export interface LoadedPeaks extends PeakComputeResult {
	asset: PeakAsset;
	sampleRate: number;
	durationSeconds: number;
}

/**
 * Decode source audio, compute overview peaks, persist OPFS binary + take.peaks metadata.
 */
export async function generateAndPersistPeaks(take: Take): Promise<LoadedPeaks> {
	if (!take.source.fileRef) {
		throw createAppError('PEAKS_NO_SOURCE', 'Take has no source file for peak generation.', {
			recoverable: true,
			context: { takeId: take.id }
		});
	}

	const file = await readBinary(take.source.fileRef);
	const decoded = await decodeAudioPlanar(file, take.source.mimeType);
	if (decoded.frameCount <= 0 || decoded.channels.length === 0) {
		throw createAppError('PEAKS_EMPTY_AUDIO', 'Decoded audio had no samples to analyze.', {
			recoverable: true,
			context: { takeId: take.id }
		});
	}

	const framesPerPeak = framesPerPeakForLength(decoded.frameCount, TARGET_OVERVIEW_PEAKS);
	const computed = await computePeaksAsync(decoded.channels, framesPerPeak);
	if (computed.peakCount <= 0) {
		throw createAppError('PEAKS_EMPTY_RESULT', 'Peak generation produced no buckets.', {
			recoverable: true,
			context: { takeId: take.id }
		});
	}

	const path = peaksPath(take.sessionId, take.id);
	const binary = encodePeaksBinary(computed);
	const written = await writeBinary(path, binary);

	const asset: PeakAsset = {
		version: 1,
		fileRef: written.fileRef,
		channels: computed.channels,
		framesPerPeak: computed.framesPerPeak,
		peakCount: computed.peakCount,
		generatedAt: nowIso()
	};

	const updated = await updateTake({
		...take,
		source: {
			...take.source,
			channelCount: decoded.channelCount,
			sampleRate: decoded.sampleRate,
			durationSeconds: take.source.durationSeconds || decoded.durationSeconds
		},
		peaks: asset
	});

	return {
		...computed,
		asset: updated.peaks ?? asset,
		sampleRate: decoded.sampleRate,
		durationSeconds: decoded.durationSeconds
	};
}

/** Load previously persisted peaks for a take. */
export async function loadPersistedPeaks(take: Take): Promise<LoadedPeaks | null> {
	if (!take.peaks?.fileRef) return null;

	try {
		const file = await readBinary(take.peaks.fileRef);
		const decoded = decodePeaksBinary(await file.arrayBuffer());
		return {
			...decoded,
			asset: take.peaks,
			sampleRate: take.source.sampleRate || 0,
			durationSeconds: take.source.durationSeconds
		};
	} catch {
		return null;
	}
}

/**
 * Ensure peaks exist for a take: load from OPFS or generate.
 * Regenerates when stored peak channel layout no longer matches decoded audio.
 */
export async function ensurePeaksForTake(take: Take): Promise<LoadedPeaks> {
	const existing = await loadPersistedPeaks(take);
	if (existing && existing.peakCount > 0 && take.source.fileRef) {
		try {
			const file = await readBinary(take.source.fileRef);
			const summary = await decodeAudioSummary(file);
			if (summary.channelCount === existing.channels) {
				return existing;
			}
		} catch {
			return existing;
		}
	} else if (existing && existing.peakCount > 0) {
		return existing;
	}
	return generateAndPersistPeaks(take);
}
