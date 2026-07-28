import type { Take } from '$lib/domain/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/audio/tag/ensure', () => ({
	ensureGeneratedTagsForTake: vi.fn()
}));

vi.mock('$lib/persistence/takes', () => ({
	getTake: vi.fn()
}));

import { ensureGeneratedTagsForTake } from '$lib/audio/tag/ensure';
import { getTake } from '$lib/persistence/takes';
import {
	getGeneratedTagsQueueDepthForTests,
	resetGeneratedTagsQueueForTests,
	scheduleGeneratedTagsForTake,
	scheduleGeneratedTagsForTakes
} from './generated-tags';

const ensureMock = vi.mocked(ensureGeneratedTagsForTake);
const getTakeMock = vi.mocked(getTake);

function savedTake(id: string): Take {
	return {
		id,
		sessionId: 'session-1',
		sequence: 1,
		lifecycleState: 'saved',
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		source: {
			fileRef: 'opfs/source',
			mimeType: 'audio/wav',
			byteLength: 100,
			durationSeconds: 2,
			channelCount: 1,
			sampleRate: 48_000,
			sourceType: 'recording'
		},
		metadata: {
			displayName: 'Take 001',
			description: '',
			tags: [],
			kind: 'one-shot',
			visibility: 'unlisted',
			provenance: {
				displayName: 'application-default',
				description: 'application-default',
				tags: 'application-default',
				kind: 'application-default',
				visibility: 'application-default'
			}
		},
		output: { format: 'wav', bitDepth: 16 },
		editRecipe: { version: 1, segments: [] },
		reviewState: 'unreviewed',
		uploadState: 'not-queued'
	};
}

describe('generated-tags queue', () => {
	beforeEach(() => {
		vi.stubGlobal('window', {});
		resetGeneratedTagsQueueForTests();
		ensureMock.mockReset();
		getTakeMock.mockReset();
		vi.stubGlobal('requestIdleCallback', undefined);
	});

	afterEach(() => {
		resetGeneratedTagsQueueForTests();
		vi.unstubAllGlobals();
	});

	it('dedupes the same take while queued or running', async () => {
		const take = savedTake('take-a');
		let resolveFirst!: () => void;
		ensureMock.mockImplementation(
			() =>
				new Promise((resolve) => {
					resolveFirst = () => resolve({ applied: false, tags: [], fromCache: true });
				})
		);

		scheduleGeneratedTagsForTake(take);
		scheduleGeneratedTagsForTake(take);
		expect(getGeneratedTagsQueueDepthForTests()).toBe(1);

		await Promise.resolve();
		resolveFirst();
		await vi.waitFor(() => expect(getGeneratedTagsQueueDepthForTests()).toBe(0));
		expect(ensureMock).toHaveBeenCalledTimes(1);
	});

	it('runs foreground jobs before background jobs', async () => {
		const order: string[] = [];
		ensureMock.mockImplementation(async (take) => {
			order.push(take.id);
			return { applied: false, tags: take.metadata.tags, fromCache: true };
		});

		scheduleGeneratedTagsForTake(savedTake('bg-1'), { priority: 'background' });
		scheduleGeneratedTagsForTake(savedTake('fg-1'), { priority: 'foreground' });
		scheduleGeneratedTagsForTake(savedTake('bg-2'), { priority: 'background' });

		await vi.waitFor(() => expect(order).toEqual(['fg-1', 'bg-1', 'bg-2']));
	});

	it('processes only one job at a time', async () => {
		const active: string[] = [];
		const order: string[] = [];
		ensureMock.mockImplementation(async (take) => {
			active.push(take.id);
			expect(active.length).toBeLessThanOrEqual(1);
			await new Promise((resolve) => setTimeout(resolve, 10));
			order.push(take.id);
			active.pop();
			return { applied: false, tags: take.metadata.tags, fromCache: true };
		});

		scheduleGeneratedTagsForTake(savedTake('take-1'));
		scheduleGeneratedTagsForTake(savedTake('take-2'));
		scheduleGeneratedTagsForTake(savedTake('take-3'));

		await vi.waitFor(() => expect(order).toEqual(['take-1', 'take-2', 'take-3']));
	});

	it('defers background batch scheduling until idle', async () => {
		const idleCallbacks: Array<() => void> = [];
		vi.stubGlobal(
			'requestIdleCallback',
			vi.fn((callback: () => void) => {
				idleCallbacks.push(callback);
				return 1;
			})
		);

		scheduleGeneratedTagsForTakes([savedTake('batch-1'), savedTake('batch-2')]);
		expect(getGeneratedTagsQueueDepthForTests()).toBe(0);

		idleCallbacks[0]?.();
		expect(getGeneratedTagsQueueDepthForTests()).toBe(2);
	});

	it('resolves take ids before tagging', async () => {
		const take = savedTake('take-id');
		getTakeMock.mockResolvedValue(take);
		ensureMock.mockResolvedValue({ applied: true, tags: ['drums'], fromCache: false });

		scheduleGeneratedTagsForTake('take-id');
		await vi.waitFor(() => expect(ensureMock).toHaveBeenCalledTimes(1));
		expect(getTakeMock).toHaveBeenCalledWith('take-id');
	});
});
