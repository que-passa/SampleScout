import * as Sentry from '@sentry/sveltekit';
import { browser, dev } from '$app/environment';
import { getPublicAppConfig } from '$lib/config/app';

let initialized = false;

export function initClientSentry(): void {
	if (!browser || initialized) return;

	const { sentry } = getPublicAppConfig();
	if (!sentry.configured) return;

	Sentry.init({
		dsn: sentry.dsn,
		environment: dev ? 'development' : 'production',
		release: `samplescout@${sentry.release}`,
		tracesSampleRate: dev ? 1 : 0.1,
		integrations: [Sentry.browserTracingIntegration()]
	});

	initialized = true;
}

export function captureSentryTestError(): void {
	throw new Error('SampleScout Sentry test error');
}
