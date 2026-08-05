import { describe, expect, it, vi } from 'vitest';
import { STORAGE_SAFETY_MARGIN_BYTES } from '$lib/config/recording';

describe('checkStorageForRecording', () => {
	it('blocks when free space is below max Capture estimate', async () => {
		const estimate = vi.fn(async () => ({
			usage: 0,
			quota: 1_000
		}));
		vi.stubGlobal('navigator', {
			storage: { estimate }
		});

		const { checkStorageForRecording, estimateMaxRecordingBytes } =
			await import('$lib/persistence/storage-gate');
		const result = await checkStorageForRecording();
		expect(result.ok).toBe(false);
		expect(result.requiredBytes).toBe(estimateMaxRecordingBytes());
		expect(result.error?.code).toBe('STORAGE_INSUFFICIENT');
		expect(result.error?.message).toMatch(/Local File/);
		expect(result.error?.message).not.toMatch(/cloud|backup/i);

		vi.unstubAllGlobals();
	});

	it('allows Capture when estimate API is missing', async () => {
		vi.stubGlobal('navigator', { storage: {} });

		const { checkStorageForRecording } = await import('$lib/persistence/storage-gate');
		const result = await checkStorageForRecording();
		expect(result.ok).toBe(true);
		expect(result.error?.code).toBe('STORAGE_ESTIMATE_UNAVAILABLE');

		vi.unstubAllGlobals();
	});
});

describe('checkStorageForSave', () => {
	it('requires blob bytes plus safety margin', async () => {
		const estimate = vi.fn(async () => ({
			usage: 0,
			quota: STORAGE_SAFETY_MARGIN_BYTES + 100
		}));
		vi.stubGlobal('navigator', {
			storage: { estimate }
		});

		const { checkStorageForSave } = await import('$lib/persistence/storage-gate');
		const tooBig = await checkStorageForSave(200);
		expect(tooBig.ok).toBe(false);
		expect(tooBig.requiredBytes).toBe(200 + STORAGE_SAFETY_MARGIN_BYTES);
		expect(tooBig.error?.message).toMatch(/Local File/);

		const fits = await checkStorageForSave(50);
		expect(fits.ok).toBe(true);

		vi.unstubAllGlobals();
	});
});

describe('storageOkForRequiredBytes', () => {
	it('returns null when estimate unsupported', async () => {
		const { storageOkForRequiredBytes } = await import('$lib/persistence/storage-gate');
		expect(storageOkForRequiredBytes(undefined, 100, false)).toBeNull();
		expect(storageOkForRequiredBytes(50, 100, true)).toBe(false);
		expect(storageOkForRequiredBytes(150, 100, true)).toBe(true);
	});
});
