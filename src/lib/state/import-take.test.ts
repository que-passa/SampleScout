import { describe, expect, it } from 'vitest';
import { RECORDING_MAX_SECONDS } from '$lib/config/recording';
import { createSession } from '$lib/domain/metadata';
import { isTakeSavedLocally } from '$lib/domain/metadata';
import { assertImportDurationAllowed, buildImportTake } from '$lib/state/import-take';

describe('import take helpers', () => {
	it('rejects audio longer than the shared capture limit', () => {
		expect(() => assertImportDurationAllowed(RECORDING_MAX_SECONDS)).not.toThrow();
		expect(() => assertImportDurationAllowed(RECORDING_MAX_SECONDS + 0.01)).toThrow();
		try {
			assertImportDurationAllowed(RECORDING_MAX_SECONDS + 1);
			expect.unreachable('expected IMPORT_TOO_LONG');
		} catch (error) {
			expect(error).toMatchObject({ code: 'IMPORT_TOO_LONG' });
		}
	});

	it('builds an import take with sourceType and originalFileName', () => {
		const session = createSession('Field import');
		const draft = buildImportTake({
			session,
			sequence: 2,
			file: { name: 'door-hit.wav', type: 'audio/wav', size: 4096 },
			durationSeconds: 1.5,
			channelCount: 2,
			sampleRate: 48000
		});

		expect(draft.source.sourceType).toBe('import');
		expect(draft.source.originalFileName).toBe('door-hit.wav');
		expect(draft.source.mimeType).toBe('audio/wav');
		expect(draft.source.byteLength).toBe(4096);
		expect(draft.source.durationSeconds).toBe(1.5);
		expect(draft.source.channelCount).toBe(2);
		expect(draft.source.sampleRate).toBe(48000);
		expect(draft.source.fileRef).toBe('');
		expect(draft.lifecycleState).toBe('finalizing');
		expect(isTakeSavedLocally(draft)).toBe(false);
		expect(draft.metadata.displayName).toMatch(/01$/);
	});

	it('falls back mime type when the file reports empty type', () => {
		const session = createSession('Field import');
		const draft = buildImportTake({
			session,
			sequence: 1,
			file: { name: 'mystery.bin', type: '', size: 128 },
			durationSeconds: 0.5,
			channelCount: 1,
			sampleRate: 44100
		});

		expect(draft.source.mimeType).toBe('application/octet-stream');
		expect(draft.source.originalFileName).toBe('mystery.bin');
	});
});
