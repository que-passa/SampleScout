import type { OutputSettings } from '$lib/domain/types';

export type UploadOutput = Extract<OutputSettings, { format: 'wav' | 'mp3' }>;
export type UploadOutputValue = 'mp3-96' | 'mp3-128' | 'mp3-192' | 'wav-16' | 'wav-24';

export const DEFAULT_UPLOAD_OUTPUT: UploadOutput = {
	format: 'mp3',
	bitrateKbps: 192
};

export const UPLOAD_OUTPUT_OPTIONS: {
	value: UploadOutputValue;
	label: string;
	hint: string;
}[] = [
	{ value: 'mp3-192', label: 'MP3 · High · 192 kbps', hint: 'Faster upload, best MP3 quality' },
	{ value: 'mp3-128', label: 'MP3 · Standard · 128 kbps', hint: 'Balanced size and quality' },
	{ value: 'mp3-96', label: 'MP3 · Compact · 96 kbps', hint: 'Smallest upload' },
	{ value: 'wav-16', label: 'WAV · 16-bit PCM', hint: 'Larger upload, broad compatibility' },
	{ value: 'wav-24', label: 'WAV · 24-bit PCM', hint: 'Largest upload, highest PCM headroom' }
];

export function outputToValue(output: UploadOutput): UploadOutputValue {
	if (output.format === 'mp3') return `mp3-${output.bitrateKbps}` as UploadOutputValue;
	return `wav-${output.bitDepth}` as UploadOutputValue;
}

export function valueToOutput(value: UploadOutputValue): UploadOutput {
	if (value.startsWith('mp3-')) {
		return {
			format: 'mp3',
			bitrateKbps: Number(value.slice(4)) as 96 | 128 | 192
		};
	}
	return {
		format: 'wav',
		bitDepth: Number(value.slice(4)) as 16 | 24
	};
}

export function normalizeUploadOutput(output: OutputSettings | undefined): UploadOutput {
	if (output?.format === 'wav' || output?.format === 'mp3') return output;
	return DEFAULT_UPLOAD_OUTPUT;
}
