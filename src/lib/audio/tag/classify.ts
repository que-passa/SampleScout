import {
	YAMNET_MAX_TAGS,
	YAMNET_MAX_WINDOWS,
	YAMNET_MIN_SCORE,
	YAMNET_SAMPLE_RATE,
	YAMNET_WINDOW_SAMPLES
} from '$lib/config/audio-tags';
import { categoriesFromClassifierResult, getAudioTagClassifier } from './classifier';
import { selectTagsFromScores, type ScoredCategory } from './labels';
import { monoDownmix, planClassificationWindows, resampleMono, sliceWindow } from './resample';

export interface ClassifyPlanarAudioResult {
	tags: string[];
	scores: ScoredCategory[];
}

function yieldToMain(): Promise<void> {
	return new Promise((resolve) => {
		if (typeof requestIdleCallback === 'function') {
			requestIdleCallback(() => resolve(), { timeout: 32 });
			return;
		}
		setTimeout(resolve, 0);
	});
}

function aggregateScores(allScores: ScoredCategory[]): ScoredCategory[] {
	const byLabel = new Map<string, ScoredCategory>();
	for (const entry of allScores) {
		const key = entry.categoryName.trim().toLowerCase();
		if (!key) continue;
		const prev = byLabel.get(key);
		if (!prev || entry.score > prev.score) {
			byLabel.set(key, { categoryName: entry.categoryName, score: entry.score });
		}
	}
	return [...byLabel.values()].sort((a, b) => b.score - a.score);
}

/** Classify planar PCM with YAMNet (evenly spaced windows, max-score aggregation). */
export async function classifyPlanarAudio(
	channels: readonly Float32Array[],
	sampleRate: number
): Promise<ClassifyPlanarAudioResult> {
	const mono = monoDownmix(channels);
	const resampled = resampleMono(mono, sampleRate, YAMNET_SAMPLE_RATE);
	if (resampled.length === 0) {
		return { tags: [], scores: [] };
	}

	const classifier = await getAudioTagClassifier();
	const starts = planClassificationWindows(
		resampled.length,
		YAMNET_WINDOW_SAMPLES,
		YAMNET_MAX_WINDOWS
	);
	const collected: ScoredCategory[] = [];

	for (const start of starts) {
		const window = sliceWindow(resampled, start, YAMNET_WINDOW_SAMPLES);
		const result = classifier.classify(window, YAMNET_SAMPLE_RATE);
		collected.push(...categoriesFromClassifierResult(result));
		await yieldToMain();
	}

	const aggregated = aggregateScores(collected);
	const tags = selectTagsFromScores(aggregated, {
		minScore: YAMNET_MIN_SCORE,
		maxTags: YAMNET_MAX_TAGS
	});

	return { tags, scores: aggregated };
}
