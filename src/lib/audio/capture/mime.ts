const MIME_CANDIDATES = [
	'audio/webm;codecs=opus',
	'audio/webm',
	'audio/mp4',
	'audio/ogg;codecs=opus',
	'audio/ogg'
] as const;

export function pickSupportedRecorderMime(): string | undefined {
	if (typeof MediaRecorder === 'undefined') return undefined;
	return MIME_CANDIDATES.find((mime) => MediaRecorder.isTypeSupported(mime));
}

export function extensionForMime(mimeType: string): string {
	if (mimeType.includes('mp4')) return 'm4a';
	if (mimeType.includes('ogg')) return 'ogg';
	return 'webm';
}
