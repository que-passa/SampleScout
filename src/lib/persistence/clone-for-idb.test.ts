import { describe, expect, it } from 'vitest';
import { cloneForIdb } from './clone-for-idb';

describe('cloneForIdb', () => {
	it('returns a plain deep copy suitable for IndexedDB', () => {
		const input = {
			id: 'a',
			nested: { tags: ['x', 'y'] }
		};
		const cloned = cloneForIdb(input);
		expect(cloned).toEqual(input);
		expect(cloned).not.toBe(input);
		expect(cloned.nested).not.toBe(input.nested);
		expect(cloned.nested.tags).not.toBe(input.nested.tags);
	});
});
