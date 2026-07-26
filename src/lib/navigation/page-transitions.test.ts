import { describe, expect, it } from 'vitest';
import { navDirection, stackDepth } from './page-transitions';

describe('stackDepth', () => {
	it('ranks Capture as root', () => {
		expect(stackDepth('/')).toBe(0);
		expect(stackDepth('/capture')).toBe(0);
	});

	it('ranks Collection and Debug one level deep', () => {
		expect(stackDepth('/drafts')).toBe(1);
		expect(stackDepth('/debug')).toBe(1);
	});

	it('ranks Take two levels deep', () => {
		expect(stackDepth('/take/abc')).toBe(2);
	});

	it('skips Account host', () => {
		expect(stackDepth('/account')).toBeNull();
	});
});

describe('navDirection', () => {
	it('is forward when stacking deeper', () => {
		expect(navDirection('/capture', '/drafts')).toBe('forward');
		expect(navDirection('/drafts', '/take/x')).toBe('forward');
	});

	it('is back when popping shallower', () => {
		expect(navDirection('/drafts', '/capture')).toBe('back');
		expect(navDirection('/take/x', '/drafts')).toBe('back');
	});

	it('fades on same depth', () => {
		expect(navDirection('/take/a', '/take/b')).toBe('fade');
		expect(navDirection('/drafts', '/debug')).toBe('fade');
	});

	it('skips Account', () => {
		expect(navDirection('/capture', '/account')).toBeNull();
		expect(navDirection('/account', '/capture')).toBeNull();
	});
});
