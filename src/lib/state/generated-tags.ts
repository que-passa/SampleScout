import { AUDIO_TAG_MAX_CONCURRENT, AUDIO_TAG_TIMEOUT_MS } from '$lib/config/audio-tags';
import { ensureGeneratedTagsForTake } from '$lib/audio/tag/ensure';
import type { DecodedPlanarAudio } from '$lib/audio/decode';
import { canApplyGeneratedTags } from '$lib/domain/metadata';
import type { Take, TakeId } from '$lib/domain/types';
import { getTake } from '$lib/persistence/takes';

export type GeneratedTagsPriority = 'foreground' | 'background';

export interface ScheduleGeneratedTagsOptions {
	/** Reuse PCM from a recent decode (e.g. peak generation) to skip a second read/decode. */
	pcm?: DecodedPlanarAudio | null;
	/** Foreground jobs run before background Collection batch work. */
	priority?: GeneratedTagsPriority;
	/** Re-run when tags are already generated (e.g. after a committed trim). */
	force?: boolean;
}

export type GeneratedTagsListener = (takeId: TakeId, applied: boolean) => void;
export type GeneratedTagsStateListener = () => void;

interface TagJob {
	takeId: TakeId;
	take?: Take;
	pcm?: DecodedPlanarAudio | null;
	priority: GeneratedTagsPriority;
	force?: boolean;
}

const listeners = new Set<GeneratedTagsListener>();
const stateListeners = new Set<GeneratedTagsStateListener>();
const queue: TagJob[] = [];
const queued = new Set<TakeId>();
const running = new Set<TakeId>();
let activeCount = 0;
let pumpScheduled = false;

export function onGeneratedTagsApplied(listener: GeneratedTagsListener): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function onGeneratedTagsStateChange(listener: GeneratedTagsStateListener): () => void {
	stateListeners.add(listener);
	return () => stateListeners.delete(listener);
}

export function isGeneratingTagsForTake(takeId: TakeId): boolean {
	return queued.has(takeId) || running.has(takeId);
}

function notifyGeneratedTagsStateChange(): void {
	for (const listener of stateListeners) {
		listener();
	}
}

function notifyGeneratedTagsApplied(takeId: TakeId, applied: boolean): void {
	for (const listener of listeners) {
		listener(takeId, applied);
	}
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(error) => {
				clearTimeout(timer);
				reject(error);
			}
		);
	});
}

function enqueueJob(job: TagJob): void {
	if (queued.has(job.takeId) || running.has(job.takeId)) return;

	queued.add(job.takeId);
	notifyGeneratedTagsStateChange();
	if (job.priority === 'foreground') {
		const backgroundIndex = queue.findIndex((entry) => entry.priority === 'background');
		if (backgroundIndex === -1) queue.push(job);
		else queue.splice(backgroundIndex, 0, job);
	} else {
		queue.push(job);
	}

	schedulePump();
}

function schedulePump(): void {
	if (pumpScheduled) return;
	pumpScheduled = true;
	queueMicrotask(() => {
		pumpScheduled = false;
		void pumpQueue();
	});
}

async function pumpQueue(): Promise<void> {
	while (activeCount < AUDIO_TAG_MAX_CONCURRENT && queue.length > 0) {
		const job = queue.shift();
		if (!job) return;

		queued.delete(job.takeId);
		running.add(job.takeId);
		notifyGeneratedTagsStateChange();
		activeCount += 1;

		void runJob(job).finally(() => {
			running.delete(job.takeId);
			activeCount -= 1;
			notifyGeneratedTagsStateChange();
			schedulePump();
		});
	}
}

async function runJob(job: TagJob): Promise<void> {
	try {
		const current = job.take ?? (await getTake(job.takeId));
		if (!current || current.lifecycleState !== 'saved') return;
		if (!canApplyGeneratedTags(current.metadata)) return;

		const result = await withTimeout(
			ensureGeneratedTagsForTake(current, { pcm: job.pcm, force: job.force }),
			AUDIO_TAG_TIMEOUT_MS,
			'Generated tags'
		);
		if (result.applied) {
			notifyGeneratedTagsApplied(job.takeId, true);
		}
	} catch (cause) {
		console.warn('[SampleScout] generated tags failed', cause);
	}
}

function deferBackgroundWork(run: () => void): void {
	if (typeof window === 'undefined') return;

	const schedule =
		typeof requestIdleCallback === 'function'
			? (callback: () => void) => requestIdleCallback(callback, { timeout: 5_000 })
			: (callback: () => void) => window.setTimeout(callback, 250);

	schedule(run);
}

/** Fire-and-forget YAMNet tagging for a saved take (skips when tags are not generic defaults). */
export function scheduleGeneratedTagsForTake(
	take: Take | TakeId,
	options?: ScheduleGeneratedTagsOptions
): void {
	if (typeof window === 'undefined') return;

	const takeId = typeof take === 'string' ? take : take.id;
	enqueueJob({
		takeId,
		take: typeof take === 'string' ? undefined : take,
		pcm: options?.pcm,
		priority: options?.priority ?? 'foreground',
		force: options?.force
	});
}

/** Queue tagging for every take in a list that still has generic default tags. */
export function scheduleGeneratedTagsForTakes(takes: readonly Take[]): void {
	if (typeof window === 'undefined') return;

	const eligible = takes.filter(
		(take) => take.lifecycleState === 'saved' && canApplyGeneratedTags(take.metadata)
	);
	if (eligible.length === 0) return;

	deferBackgroundWork(() => {
		for (const take of eligible) {
			scheduleGeneratedTagsForTake(take, { priority: 'background' });
		}
	});
}

/** Test hook — drain queue state between unit tests. */
export function resetGeneratedTagsQueueForTests(): void {
	queue.length = 0;
	queued.clear();
	running.clear();
	activeCount = 0;
	pumpScheduled = false;
	listeners.clear();
	stateListeners.clear();
}

/** Test hook — inspect queue depth. */
export function getGeneratedTagsQueueDepthForTests(): number {
	return queue.length + running.size;
}
