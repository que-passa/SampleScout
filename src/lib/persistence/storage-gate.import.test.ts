import { describe, expect, it, vi } from 'vitest';
import { STORAGE_SAFETY_MARGIN_BYTES } from '$lib/config/recording';

describe('checkStorageForImport', () => {
	it('requires file bytes plus safety margin', async () => {
		const estimate = vi.fn(async () => ({
			usage: 0,
			quota: STORAGE_SAFETY_MARGIN_BYTES + 100
		}));
		vi.stubGlobal('navigator', {
			storage: { estimate }
		});

		const { checkStorageForImport } = await import('$lib/persistence/storage-gate');
		const tooBig = await checkStorageForImport(200);
		expect(tooBig.ok).toBe(false);
		expect(tooBig.requiredBytes).toBe(200 + STORAGE_SAFETY_MARGIN_BYTES);

		const fits = await checkStorageForImport(50);
		expect(fits.ok).toBe(true);

		vi.unstubAllGlobals();
	});
});
