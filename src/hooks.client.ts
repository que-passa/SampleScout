import * as Sentry from '@sentry/sveltekit';
import { initClientSentry } from '$lib/monitoring/sentry-client';

initClientSentry();

export const handleError = Sentry.handleErrorWithSentry();
