import { sendFeedback } from '@sentry/browser';
import { getPublicAppConfig } from '$lib/config/app';
import { isClientSentryActive } from './sentry-client';

export type SubmitUserFeedbackInput = {
	message: string;
	/** SvelteKit route id pattern (e.g. `/take/[takeId]`), not raw params. */
	routeId?: string | null;
	name?: string;
	email?: string;
};

export class FeedbackSubmitError extends Error {
	readonly code: 'empty' | 'unavailable' | 'failed';

	constructor(code: 'empty' | 'unavailable' | 'failed', message: string) {
		super(message);
		this.name = 'FeedbackSubmitError';
		this.code = code;
	}
}

/** Normalize a route id for Sentry tags — strip accidental query/hash. */
export function feedbackRouteTag(routeId: string | null | undefined): string {
	if (!routeId) return 'unknown';
	const trimmed = routeId.trim();
	if (!trimmed) return 'unknown';
	return trimmed.split(/[?#]/, 1)[0] || 'unknown';
}

/**
 * Post intentional user feedback via Sentry User Feedback API.
 * Throws {@link FeedbackSubmitError} when empty, Sentry inactive, or send fails.
 */
export async function submitUserFeedback(input: SubmitUserFeedbackInput): Promise<void> {
	const message = input.message.trim();
	if (!message) {
		throw new FeedbackSubmitError('empty', 'Write a short message first.');
	}

	if (!isClientSentryActive()) {
		throw new FeedbackSubmitError('unavailable', 'Could not send feedback.');
	}

	const { sentry } = getPublicAppConfig();
	const route = feedbackRouteTag(input.routeId);
	const name = input.name?.trim() || undefined;
	const email = input.email?.trim() || undefined;

	try {
		await sendFeedback(
			{
				message,
				name,
				email,
				// Prefer route pattern over raw href (avoids take UUIDs in the payload).
				url: route,
				source: 'samplescout-feedback-sheet',
				tags: {
					route,
					app_release: sentry.release
				}
			},
			{ includeReplay: false }
		);
	} catch {
		throw new FeedbackSubmitError('failed', 'Could not send feedback.');
	}
}
