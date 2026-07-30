import { env } from '$env/dynamic/public';
import { APP_NAME, APP_VERSION } from './recording';

export interface PublicAppConfig {
	appName: string;
	appVersion: string;
	audiotool: {
		clientId: string;
		redirectUrl: string;
		scopes: string[];
		configured: boolean;
	};
	sentry: {
		dsn: string;
		release: string;
		configured: boolean;
		/** When true, client Sentry also runs under `npm run dev` (default: off). */
		enableInDev: boolean;
	};
}

function parseScopes(raw: string | undefined): string[] {
	if (!raw) return [];
	return raw
		.split(/[,\s]+/)
		.map((scope) => scope.trim())
		.filter(Boolean);
}

export function getPublicAppConfig(): PublicAppConfig {
	const clientId = env.PUBLIC_AUDIOTOOL_CLIENT_ID ?? '';
	const redirectUrl = env.PUBLIC_AUDIOTOOL_REDIRECT_URL ?? '';
	const scopes = parseScopes(env.PUBLIC_AUDIOTOOL_SCOPES);
	const dsn = env.PUBLIC_SENTRY_DSN ?? '';
	const enableInDevRaw = env.PUBLIC_SENTRY_ENABLE_IN_DEV ?? '';
	const enableInDev = enableInDevRaw === '1' || enableInDevRaw.toLowerCase() === 'true';

	return {
		appName: APP_NAME,
		appVersion: APP_VERSION,
		audiotool: {
			clientId,
			redirectUrl,
			scopes,
			configured: Boolean(clientId && redirectUrl)
		},
		sentry: {
			dsn,
			release: APP_VERSION,
			configured: Boolean(dsn),
			enableInDev
		}
	};
}
