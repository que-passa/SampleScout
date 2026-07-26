import { describe, expect, it } from 'vitest';
import { peaksPath, sourcePath, trashPath } from './paths';

describe('opfs path helpers', () => {
	it('builds stable take paths', () => {
		expect(sourcePath('sess-1', 'take-1')).toBe('sessions/sess-1/takes/take-1/source.bin');
		expect(peaksPath('sess-1', 'take-1')).toBe('sessions/sess-1/takes/take-1/peaks-v1.bin');
		expect(trashPath('cleanup-1', 'source.bin')).toBe('trash/cleanup-1/source.bin');
	});
});
