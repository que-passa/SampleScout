/**
 * Copy MediaPipe audio WASM + download YAMNet model into static/ for offline PWA use.
 * Run after npm install: npm run fetch:ml-assets
 */
import { access, cp, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wasmSrc = path.join(root, 'node_modules/@mediapipe/tasks-audio/wasm');
const wasmDest = path.join(root, 'static/mediapipe/wasm');
const modelDest = path.join(root, 'static/models/yamnet.tflite');
const modelUrl =
	'https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite';

async function exists(filePath) {
	try {
		await access(filePath);
		return true;
	} catch {
		return false;
	}
}

if (!(await exists(wasmSrc))) {
	console.error('Missing @mediapipe/tasks-audio — run npm install first.');
	process.exit(1);
}

await mkdir(path.dirname(modelDest), { recursive: true });
await mkdir(wasmDest, { recursive: true });

await cp(wasmSrc, wasmDest, { recursive: true, force: true });
console.log('copied MediaPipe audio WASM → static/mediapipe/wasm');

if (await exists(modelDest)) {
	console.log('yamnet.tflite already present — skipping download');
} else {
	console.log('downloading yamnet.tflite…');
	const response = await fetch(modelUrl);
	if (!response.ok) {
		throw new Error(`Failed to download YAMNet model (${response.status})`);
	}
	const buffer = Buffer.from(await response.arrayBuffer());
	await writeFile(modelDest, buffer);
	console.log(
		`wrote static/models/yamnet.tflite (${(buffer.length / (1024 * 1024)).toFixed(1)} MB)`
	);
}
