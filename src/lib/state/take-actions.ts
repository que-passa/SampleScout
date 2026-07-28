import { deriveCatalogReference } from '$lib/domain/catalog';
import type { TakeMetadataPatch } from '$lib/domain/metadata';
import type { EditRecipe, Take, TakeId } from '$lib/domain/types';
import {
	discardTake,
	extractTakeFromSelection,
	processDueCleanups,
	renameTake,
	updateTakeEditRecipe,
	updateTakeMetadata,
	updateTakeOutput
} from '$lib/persistence';
import { actionToast } from './action-toast';
import { scheduleGeneratedTagsForTake } from './generated-tags';
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';

type InventoryListener = () => void | Promise<void>;
const inventoryListeners = new Set<InventoryListener>();

/** Notify UI when visible takes change (discard / rename / extract). */
export function onTakeInventoryChanged(listener: InventoryListener): () => void {
	inventoryListeners.add(listener);
	return () => inventoryListeners.delete(listener);
}

export async function notifyTakeInventoryChanged(): Promise<void> {
	for (const listener of inventoryListeners) {
		await listener();
	}
}

/**
 * Collect a retained trim into a new Local File (shared source).
 * Child recipe clones the collectable parent recipe (bounds, fades, normalize, …).
 * Parent source stays intact; the take page resets parent recipe to identity after Collect.
 */
export async function collectSelectionAsLocalFile(input: {
	parentTakeId: TakeId;
	/** Collectable recipe to commit; defaults to the persisted parent recipe. */
	recipe?: EditRecipe;
}): Promise<Take> {
	const take = await extractTakeFromSelection(input);
	scheduleGeneratedTagsForTake(take);
	await notifyTakeInventoryChanged();

	const label = take.metadata.displayName || deriveCatalogReference(take);
	actionToast.show(`Collected · ${label}`, {
		actionLabel: 'Open',
		onAction: async () => {
			await goto(resolve(`/take/${take.id}`));
		}
	});

	return take;
}

/** @deprecated Use {@link collectSelectionAsLocalFile}. */
export const extractSelectionAsLocalFile = collectSelectionAsLocalFile;

/**
 * Discard a take immediately. Binary cleanup is scheduled in IndexedDB.
 */
export async function discardLocalFile(
	takeId: TakeId,
	options?: { silent?: boolean }
): Promise<void> {
	const take = await discardTake(takeId);
	await notifyTakeInventoryChanged();
	await processDueCleanups();

	if (!options?.silent) {
		const label = take.metadata.displayName || deriveCatalogReference(take);
		actionToast.show(`${label} discarded`);
	}
}

/**
 * Discard many takes sequentially. One summary toast unless `silent`; partial failures do not roll back.
 */
export async function discardLocalFiles(
	takeIds: TakeId[],
	options?: { silent?: boolean }
): Promise<{ discarded: TakeId[]; errors: { takeId: TakeId; message: string }[] }> {
	const discarded: TakeId[] = [];
	const errors: { takeId: TakeId; message: string }[] = [];

	for (const takeId of takeIds) {
		try {
			await discardTake(takeId);
			discarded.push(takeId);
		} catch (cause) {
			const message =
				cause && typeof cause === 'object' && 'message' in cause
					? String((cause as { message: string }).message)
					: 'Could not discard Local File.';
			errors.push({ takeId, message });
		}
	}

	if (discarded.length > 0) {
		await notifyTakeInventoryChanged();
		await processDueCleanups();
		if (!options?.silent) {
			actionToast.show(
				discarded.length === 1
					? '1 Local File discarded'
					: `${discarded.length} Local Files discarded`
			);
		}
	}

	return { discarded, errors };
}

export async function renameTakeDisplayName(takeId: TakeId, name: string): Promise<Take> {
	const take = await renameTake(takeId, name);
	await notifyTakeInventoryChanged();
	return take;
}

/** Persist Field Notes; source binary stays unchanged. */
export async function saveTakeMetadata(takeId: TakeId, patch: TakeMetadataPatch): Promise<Take> {
	const take = await updateTakeMetadata(takeId, patch);
	await notifyTakeInventoryChanged();
	return take;
}

/**
 * Apply the same Field Notes patch to many takes. Failures do not roll back earlier successes.
 */
export async function batchSaveTakeMetadata(
	takeIds: TakeId[],
	patch: TakeMetadataPatch
): Promise<{ updated: Take[]; errors: { takeId: TakeId; message: string }[] }> {
	const updated: Take[] = [];
	const errors: { takeId: TakeId; message: string }[] = [];

	for (const takeId of takeIds) {
		try {
			updated.push(await updateTakeMetadata(takeId, patch));
		} catch (cause) {
			const message =
				cause && typeof cause === 'object' && 'message' in cause
					? String((cause as { message: string }).message)
					: 'Could not update Field Notes.';
			errors.push({ takeId, message });
		}
	}

	if (updated.length > 0) {
		await notifyTakeInventoryChanged();
	}

	return { updated, errors };
}

/** Persist edit recipe; source binary stays unchanged. */
export async function saveTakeEditRecipe(takeId: TakeId, editRecipe: EditRecipe): Promise<Take> {
	const take = await updateTakeEditRecipe(takeId, editRecipe);
	scheduleGeneratedTagsForTake(take, { priority: 'background', force: true });
	await notifyTakeInventoryChanged();
	return take;
}

/** Persist export format settings for a take. */
export async function saveTakeOutput(takeId: TakeId, output: Take['output']): Promise<Take> {
	const take = await updateTakeOutput(takeId, output);
	await notifyTakeInventoryChanged();
	return take;
}

/** Drain due cleanup jobs (safe to call on hydrate / visibility). */
export async function runDeferredCleanup(): Promise<void> {
	await processDueCleanups();
}
