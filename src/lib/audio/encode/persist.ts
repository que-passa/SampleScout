import { decodeAudioPlanar } from '$lib/audio/decode';
import { renderRecipePlanar } from '$lib/audio/render';
import { createAppError, nowIso } from '$lib/domain/ids';
import type { OutputSettings, RenderedAsset, Take } from '$lib/domain/types';
import { enqueueCleanup, renderedMp3Path, renderedWavPath, updateTake } from '$lib/persistence';
import { readBinary, writeBinary } from '$lib/persistence/opfs';
import { encodePlanar, type EncodePlanarOptions, type EncodedAudio } from './encode-planar';
import { shortHash } from './hash';

export interface PersistEncodedOptions extends EncodePlanarOptions {
	/** Override take.output for this encode. */
	output?: OutputSettings;
}

export interface PersistEncodedResult {
	take: Take;
	encoded: EncodedAudio;
	blob: Blob;
}

/**
 * Decode → render recipe → encode → OPFS write → attach `take.renderedAsset`.
 * Failed encodes leave source, recipe, and prior rendered asset unchanged until a successful write.
 */
export async function encodeAndPersistTakeOutput(
	take: Take,
	options: PersistEncodedOptions = {}
): Promise<PersistEncodedResult> {
	const output = options.output ?? take.output;
	if (output.format === 'source') {
		throw createAppError(
			'ENCODE_SOURCE_PASSTHROUGH',
			'Source-format output does not produce a rendered asset.',
			{ recoverable: true, context: { takeId: take.id } }
		);
	}

	if (!take.source.fileRef) {
		throw createAppError('ENCODE_NO_SOURCE', 'Take has no source file to encode.', {
			recoverable: true,
			context: { takeId: take.id }
		});
	}

	const file = await readBinary(take.source.fileRef);
	const decoded = await decodeAudioPlanar(file, take.source.mimeType);
	const rendered = renderRecipePlanar(decoded, take.editRecipe);
	const encoded = await encodePlanar(rendered, output, {
		signal: options.signal,
		onProgress: options.onProgress
	});

	const path =
		encoded.format === 'wav'
			? renderedWavPath(take.sessionId, take.id, shortHash(encoded.hash))
			: renderedMp3Path(take.sessionId, take.id, shortHash(encoded.hash));

	const written = await writeBinary(path, encoded.bytes);
	const asset: RenderedAsset = {
		fileRef: written.fileRef,
		mimeType: encoded.mimeType,
		byteLength: written.byteLength,
		hash: encoded.hash,
		createdAt: nowIso()
	};

	const previousRef = take.renderedAsset?.fileRef;
	const updated = await updateTake({
		...take,
		output,
		renderedAsset: asset
	});

	if (previousRef && previousRef !== asset.fileRef) {
		try {
			await enqueueCleanup([previousRef], nowIso());
		} catch {
			/* best-effort stale export cleanup */
		}
	}

	return {
		take: updated,
		encoded,
		blob: new Blob([new Uint8Array(encoded.bytes)], { type: encoded.mimeType })
	};
}
