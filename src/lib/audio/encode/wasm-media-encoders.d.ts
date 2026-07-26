declare module 'wasm-media-encoders' {
	type Mp3CbrValues =
		8 | 16 | 24 | 32 | 40 | 48 | 64 | 80 | 96 | 112 | 128 | 160 | 192 | 224 | 256 | 320;

	interface WasmMediaEncoder {
		configure(params: {
			channels: 1 | 2;
			sampleRate: number;
			bitrate?: Mp3CbrValues;
			vbrQuality?: number;
		}): void;
		encode(samples: readonly Float32Array[]): Uint8Array;
		finalize(): Uint8Array;
	}

	export function createMp3Encoder(): Promise<WasmMediaEncoder>;
	export function createOggEncoder(): Promise<WasmMediaEncoder>;
}
