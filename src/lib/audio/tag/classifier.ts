import {
	AudioClassifier,
	FilesetResolver,
	type AudioClassifierResult
} from '@mediapipe/tasks-audio';
import { base } from '$app/paths';

let classifierPromise: Promise<AudioClassifier> | null = null;
let classifierFailed = false;

function staticAssetUrl(relativePath: string): string {
	const normalized = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
	const prefix = base.endsWith('/') ? base.slice(0, -1) : base;
	return `${prefix}${normalized}`;
}

export function resetAudioTagClassifierForTests(): void {
	classifierPromise?.then((classifier) => classifier.close()).catch(() => {});
	classifierPromise = null;
	classifierFailed = false;
}

export async function getAudioTagClassifier(): Promise<AudioClassifier> {
	if (classifierFailed) {
		throw new Error('Audio tag classifier is unavailable in this browser.');
	}

	if (!classifierPromise) {
		classifierPromise = (async () => {
			const wasm = await FilesetResolver.forAudioTasks(staticAssetUrl('/mediapipe/wasm'));
			return AudioClassifier.createFromModelPath(wasm, staticAssetUrl('/models/yamnet.tflite'));
		})().catch((cause) => {
			classifierFailed = true;
			classifierPromise = null;
			throw cause;
		});
	}

	return classifierPromise;
}

export function categoriesFromClassifierResult(
	result: AudioClassifierResult[]
): { categoryName: string; score: number }[] {
	const categories: { categoryName: string; score: number }[] = [];
	for (const frame of result) {
		for (const classification of frame.classifications) {
			for (const category of classification.categories) {
				if (!category.categoryName) continue;
				categories.push({
					categoryName: category.categoryName,
					score: category.score ?? 0
				});
			}
		}
	}
	return categories;
}
