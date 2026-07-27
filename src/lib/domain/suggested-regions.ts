import type { SuggestedRegion } from '$lib/audio/suggest/types';
import type { TakeId } from '$lib/domain/types';

/** Persisted Suggested Regions cache row (Dexie `suggestedRegions`). */
export interface SuggestedRegionsRecord {
	takeId: TakeId;
	/** `fileRef|byteLength|durationSeconds|algorithmVersion` */
	sourceFingerprint: string;
	algorithmVersion: number;
	regions: SuggestedRegion[];
	analyzedAt: string;
	updatedAt: string;
}
