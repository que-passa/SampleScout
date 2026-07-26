import { createAppError } from '$lib/domain/ids';
import type { PeakComputeResult } from './compute';

/** Magic ASCII "PKS1" as little-endian uint32. */
export const PEAKS_MAGIC = 0x31534b50;
export const PEAKS_FORMAT_VERSION = 1;

export interface PeakBinaryPayload extends PeakComputeResult {
	version: 1;
}

const HEADER_BYTES = 16;

export function encodePeaksBinary(payload: PeakComputeResult): ArrayBuffer {
	const { channels, peakCount, framesPerPeak, data } = payload;
	const expected = channels * peakCount * 2;
	if (data.length !== expected) {
		throw createAppError('PEAKS_ENCODE_FAILED', 'Peak data length does not match header.', {
			recoverable: false,
			context: { expected, actual: data.length, channels, peakCount }
		});
	}

	const buffer = new ArrayBuffer(HEADER_BYTES + data.byteLength);
	const view = new DataView(buffer);
	view.setUint32(0, PEAKS_MAGIC, true);
	view.setUint16(4, PEAKS_FORMAT_VERSION, true);
	view.setUint16(6, channels, true);
	view.setUint32(8, peakCount, true);
	view.setUint32(12, framesPerPeak, true);
	new Float32Array(buffer, HEADER_BYTES).set(data);
	return buffer;
}

export function decodePeaksBinary(buffer: ArrayBuffer): PeakBinaryPayload {
	if (buffer.byteLength < HEADER_BYTES) {
		throw createAppError('PEAKS_DECODE_FAILED', 'Peak binary is too short.', {
			recoverable: true
		});
	}

	const view = new DataView(buffer);
	const magic = view.getUint32(0, true);
	if (magic !== PEAKS_MAGIC) {
		throw createAppError('PEAKS_DECODE_FAILED', 'Peak binary magic mismatch.', {
			recoverable: true,
			context: { magic }
		});
	}

	const version = view.getUint16(4, true);
	if (version !== PEAKS_FORMAT_VERSION) {
		throw createAppError('PEAKS_DECODE_FAILED', 'Unsupported peak binary version.', {
			recoverable: true,
			context: { version }
		});
	}

	const channels = view.getUint16(6, true);
	const peakCount = view.getUint32(8, true);
	const framesPerPeak = view.getUint32(12, true);
	const expectedFloats = channels * peakCount * 2;
	const expectedBytes = HEADER_BYTES + expectedFloats * 4;
	if (buffer.byteLength < expectedBytes) {
		throw createAppError('PEAKS_DECODE_FAILED', 'Peak binary truncated.', {
			recoverable: true,
			context: { expectedBytes, actual: buffer.byteLength }
		});
	}

	const data = new Float32Array(buffer, HEADER_BYTES, expectedFloats).slice();
	return {
		version: 1,
		channels,
		peakCount,
		framesPerPeak,
		data
	};
}
