import { afterEach, describe, expect, it } from 'vitest';
import { SUGGEST_REGIONS_AUTO_BUDGET_MS } from '$lib/config/suggest-regions';
import {
	disableSuggestAutoForSession,
	isSuggestAutoDisabledForSession,
	noteSuggestAutoAnalysisDuration,
	resetSuggestAutoBudgetForTests
} from './auto-budget';

afterEach(() => {
	resetSuggestAutoBudgetForTests();
});

describe('suggest auto budget session policy', () => {
	it('starts enabled for the session', () => {
		expect(isSuggestAutoDisabledForSession()).toBe(false);
	});

	it('disables auto after an explicit disable', () => {
		disableSuggestAutoForSession();
		expect(isSuggestAutoDisabledForSession()).toBe(true);
	});

	it('disables auto when analysis exceeds the typical budget', () => {
		noteSuggestAutoAnalysisDuration(SUGGEST_REGIONS_AUTO_BUDGET_MS);
		expect(isSuggestAutoDisabledForSession()).toBe(false);

		noteSuggestAutoAnalysisDuration(SUGGEST_REGIONS_AUTO_BUDGET_MS + 1);
		expect(isSuggestAutoDisabledForSession()).toBe(true);
	});

	it('ignores non-finite durations', () => {
		noteSuggestAutoAnalysisDuration(Number.NaN);
		noteSuggestAutoAnalysisDuration(-10);
		expect(isSuggestAutoDisabledForSession()).toBe(false);
	});
});
