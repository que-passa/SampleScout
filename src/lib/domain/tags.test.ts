import { describe, expect, it } from 'vitest';
import {
	addTag,
	addTags,
	formatTagList,
	hasTag,
	isHiddenSystemTag,
	parseTagList,
	rememberRecentTags,
	removeTag,
	TAG_PRESETS,
	tagsEqual,
	visibleTags
} from './tags';

describe('tag helpers', () => {
	it('adds and dedupes case-insensitively', () => {
		expect(addTag(['rain'], 'Rain')).toEqual(['rain']);
		expect(addTags([], ['Field', 'field', 'metal'])).toEqual(['Field', 'metal']);
	});

	it('rejects hidden system tags', () => {
		expect(addTag([], 'recording')).toEqual([]);
		expect(isHiddenSystemTag('sample-scout')).toBe(true);
		expect(visibleTags(['foley', 'recording', 'sample-scout'])).toEqual(['foley']);
	});

	it('removes tags case-insensitively', () => {
		expect(removeTag(['Rain', 'bird'], 'rain')).toEqual(['bird']);
	});

	it('detects membership case-insensitively', () => {
		expect(hasTag(['Rain'], 'rain')).toBe(true);
		expect(hasTag(['Rain'], 'bird')).toBe(false);
	});

	it('compares tag arrays in order', () => {
		expect(tagsEqual(['a', 'b'], ['a', 'b'])).toBe(true);
		expect(tagsEqual(['a', 'b'], ['b', 'a'])).toBe(false);
	});
});

describe('parseTagList / formatTagList', () => {
	it('splits and dedupes tags', () => {
		expect(parseTagList('field, metal; field\nwood')).toEqual(['field', 'metal', 'wood']);
		expect(parseTagList('Field, field')).toEqual(['Field']);
		expect(formatTagList(['field', 'metal'])).toBe('field, metal');
	});
});

describe('rememberRecentTags', () => {
	it('prepends used tags and trims at limit', () => {
		expect(rememberRecentTags(['old'], ['rain', 'bird'], 3)).toEqual(['rain', 'bird', 'old']);
		expect(rememberRecentTags(['rain', 'old'], ['Rain', 'crowd'], 3)).toEqual([
			'Rain',
			'crowd',
			'old'
		]);
	});

	it('skips hidden system tags', () => {
		expect(rememberRecentTags([], ['foley', 'recording'], 12)).toEqual(['foley']);
	});
});

describe('TAG_PRESETS', () => {
	it('lists sample-identity presets without hidden or kind duplicates', () => {
		expect(TAG_PRESETS).toHaveLength(30);
		expect(TAG_PRESETS).toContain('hit');
		expect(TAG_PRESETS).toContain('grass');
		expect(TAG_PRESETS).toContain('sand');
		expect(TAG_PRESETS).not.toContain('music');
		expect(TAG_PRESETS).not.toContain('one-shot');
	});
});
