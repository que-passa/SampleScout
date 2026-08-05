import { describe, expect, it } from 'vitest';
import { feedbackRouteTag, FeedbackSubmitError } from './submit-feedback';

describe('feedbackRouteTag', () => {
	it('returns unknown for empty values', () => {
		expect(feedbackRouteTag(undefined)).toBe('unknown');
		expect(feedbackRouteTag(null)).toBe('unknown');
		expect(feedbackRouteTag('')).toBe('unknown');
		expect(feedbackRouteTag('   ')).toBe('unknown');
	});

	it('keeps SvelteKit route patterns', () => {
		expect(feedbackRouteTag('/take/[takeId]')).toBe('/take/[takeId]');
		expect(feedbackRouteTag('/collection')).toBe('/collection');
	});

	it('strips query and hash', () => {
		expect(feedbackRouteTag('/collection?x=1')).toBe('/collection');
		expect(feedbackRouteTag('/debug#top')).toBe('/debug');
	});
});

describe('FeedbackSubmitError', () => {
	it('carries a stable code', () => {
		const error = new FeedbackSubmitError('unavailable', 'Could not send feedback.');
		expect(error.code).toBe('unavailable');
		expect(error.message).toBe('Could not send feedback.');
	});
});
