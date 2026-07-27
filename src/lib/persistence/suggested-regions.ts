import { SUGGEST_REGIONS_ALGORITHM_VERSION } from '$lib/config/suggest-regions';
import type { SuggestedRegion } from '$lib/audio/suggest/types';
import { nowIso } from '$lib/domain/ids';
import type { SuggestedRegionsRecord } from '$lib/domain/suggested-regions';
import type { Take, TakeId } from '$lib/domain/types';
import { cloneForIdb } from './clone-for-idb';
import { getDatabase } from './db';

export function suggestedRegionsSourceFingerprint(take: Take, algorithmVersion?: number): string {
	const version = algorithmVersion ?? SUGGEST_REGIONS_ALGORITHM_VERSION;
	const fileRef = take.source.fileRef ?? '';
	const bytes = take.source.byteLength ?? 0;
	const duration = take.source.durationSeconds ?? 0;
	return `${fileRef}|${bytes}|${duration}|${version}`;
}

export async function getSuggestedRegions(
	takeId: TakeId
): Promise<SuggestedRegionsRecord | undefined> {
	return getDatabase().suggestedRegions.get(takeId);
}

export async function putSuggestedRegions(
	record: SuggestedRegionsRecord
): Promise<SuggestedRegionsRecord> {
	const plain = cloneForIdb(record);
	await getDatabase().suggestedRegions.put(plain);
	return plain;
}

export async function deleteSuggestedRegions(takeId: TakeId): Promise<void> {
	await getDatabase().suggestedRegions.delete(takeId);
}

export async function saveSuggestedRegionsForTake(
	take: Take,
	regions: SuggestedRegion[],
	algorithmVersion: number
): Promise<SuggestedRegionsRecord> {
	const now = nowIso();
	const record: SuggestedRegionsRecord = {
		takeId: take.id,
		sourceFingerprint: suggestedRegionsSourceFingerprint(take, algorithmVersion),
		algorithmVersion,
		regions: regions.map((region) => ({
			startSeconds: region.startSeconds,
			endSeconds: region.endSeconds
		})),
		analyzedAt: now,
		updatedAt: now
	};
	return putSuggestedRegions(record);
}

export function isSuggestedRegionsCacheFresh(
	record: SuggestedRegionsRecord | undefined,
	take: Take
): record is SuggestedRegionsRecord {
	if (!record) return false;
	return (
		record.sourceFingerprint === suggestedRegionsSourceFingerprint(take, record.algorithmVersion)
	);
}
