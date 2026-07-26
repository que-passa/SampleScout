/** WAV and MP3 encoders for export / upload. */

export {
	estimateEncodedByteLength,
	estimateMp3ByteLength,
	formatByteEstimate,
	type Mp3BitrateKbps
} from './estimate';
export { encodePlanar, type EncodedAudio, type EncodePlanarOptions } from './encode-planar';
export { hashBytes, shortHash } from './hash';
export { encodeMp3Planar, type EncodeMp3CoreOptions } from './mp3-core';
export {
	encodeAndPersistTakeOutput,
	type PersistEncodedOptions,
	type PersistEncodedResult
} from './persist';
export { encodeWav, wavByteLength, type WavBitDepth } from './wav';
export { encodeMp3Async, type EncodeMp3AsyncOptions } from './worker-client';
