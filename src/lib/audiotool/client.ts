import { audiotool, type AuthenticatedClient, type BrowserAuthResult } from '@audiotool/nexus';
import { getPublicAppConfig } from '$lib/config/app';
import { createAppError } from '$lib/domain/ids';
import type { AppError, TakeMetadata } from '$lib/domain/types';

export type AudiotoolConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface AudiotoolAuthStatus {
	state: AudiotoolConnectionState;
	configured: boolean;
	message: string;
	userName?: string;
	displayName?: string;
	avatarUrl?: string;
	error?: AppError;
}

export interface AudiotoolUploadRequest {
	file: Blob;
	metadata: Pick<
		TakeMetadata,
		'displayName' | 'description' | 'tags' | 'kind' | 'visibility' | 'bpm'
	>;
	/** Cancel in-flight byte upload / processing wait when aborted. */
	signal?: AbortSignal;
	/** Called when bytes finish uploading (before Audiotool processing). */
	onBytesUploaded?: () => void | Promise<void>;
	/** Called when waiting on Audiotool processing after bytes are up. */
	onProcessing?: () => void | Promise<void>;
}

let authResult: BrowserAuthResult | undefined;
let initPromise: Promise<BrowserAuthResult | undefined> | undefined;
let cachedProfile: Pick<AudiotoolAuthStatus, 'avatarUrl' | 'displayName'> | undefined;
/** Serialize Audiotool uploads so server-side slots always settle before the next createSample. */
let uploadChain: Promise<unknown> = Promise.resolve();

function scopeString(): string {
	const scopes = getPublicAppConfig().audiotool.scopes;
	// Spike default until sample-specific scopes are confirmed in the developer dashboard.
	return scopes.length > 0 ? scopes.join(' ') : 'project:write';
}

function userResourceName(userName: string): string {
	return userName.startsWith('users/') ? userName : `users/${userName}`;
}

/**
 * Fetch the connected user's public profile (avatar / display name).
 * Errors leave avatar/displayName undefined.
 */
export async function fetchConnectedUserProfile(
	client: AuthenticatedClient
): Promise<Pick<AudiotoolAuthStatus, 'avatarUrl' | 'displayName'>> {
	const response = await client.users.getUser({ name: userResourceName(client.userName) });
	if (response instanceof Error || !response.user) {
		return {};
	}

	const avatarUrl = response.user.avatarUrl?.trim() || undefined;
	const displayName = response.user.displayName?.trim() || undefined;
	return { avatarUrl, displayName };
}

function toStatus(
	result: BrowserAuthResult | undefined,
	profile?: Pick<AudiotoolAuthStatus, 'avatarUrl' | 'displayName'>
): AudiotoolAuthStatus {
	const config = getPublicAppConfig();

	if (!config.audiotool.configured) {
		return {
			state: 'disconnected',
			configured: false,
			message:
				'Set PUBLIC_AUDIOTOOL_CLIENT_ID and PUBLIC_AUDIOTOOL_REDIRECT_URL in .env.'
		};
	}

	if (!result) {
		return {
			state: 'disconnected',
			configured: true,
			message: 'Starting…'
		};
	}

	if (result.status === 'authenticated') {
		return {
			state: 'connected',
			configured: true,
			userName: result.userName,
			displayName: profile?.displayName,
			avatarUrl: profile?.avatarUrl,
			message: ''
		};
	}

	if (result.error) {
		return {
			state: 'error',
			configured: true,
			message: result.error.message || 'Audiotool authentication failed.',
			error: createAppError('AUDIOTOOL_AUTH_FAILED', result.error.message, {
				cause: result.error,
				recoverable: true
			})
		};
	}

	return {
		state: 'disconnected',
		configured: true,
		message: 'Connect to upload.'
	};
}

async function statusWithProfile(
	result: BrowserAuthResult | undefined
): Promise<AudiotoolAuthStatus> {
	if (result?.status !== 'authenticated') {
		cachedProfile = undefined;
		return toStatus(result);
	}

	if (!cachedProfile) {
		cachedProfile = await fetchConnectedUserProfile(result);
	}

	return toStatus(result, cachedProfile);
}

/**
 * Initialize (or re-read) the Nexus browser OAuth client.
 * Safe to call on Account mount — handles redirect callback query params.
 */
export async function initAudiotoolClient(): Promise<AudiotoolAuthStatus> {
	const config = getPublicAppConfig();
	if (!config.audiotool.configured) {
		authResult = undefined;
		cachedProfile = undefined;
		return toStatus(undefined);
	}

	if (!initPromise) {
		initPromise = (async () => {
			try {
				authResult = await audiotool({
					clientId: config.audiotool.clientId,
					redirectUrl: config.audiotool.redirectUrl,
					scope: scopeString()
				});
				return authResult;
			} catch (cause) {
				authResult = {
					status: 'unauthenticated',
					login: () => undefined,
					error: cause instanceof Error ? cause : new Error(String(cause))
				};
				return authResult;
			}
		})();
	}

	await initPromise;
	return statusWithProfile(authResult);
}

export function getAudiotoolAuthStatus(): AudiotoolAuthStatus {
	return toStatus(authResult, cachedProfile);
}

export async function connectAudiotool(): Promise<AudiotoolAuthStatus> {
	const status = await initAudiotoolClient();
	if (!status.configured) return status;

	if (authResult?.status === 'authenticated') {
		return statusWithProfile(authResult);
	}

	if (authResult?.status === 'unauthenticated') {
		authResult.login();
		return {
			state: 'connecting',
			configured: true,
			message: 'Opening Audiotool…'
		};
	}

	return {
		state: 'error',
		configured: true,
		message: 'Login unavailable.',
		error: createAppError('AUDIOTOOL_AUTH_FAILED', 'Could not start the Audiotool login flow.', {
			recoverable: true
		})
	};
}

export async function disconnectAudiotool(): Promise<AudiotoolAuthStatus> {
	if (authResult?.status === 'authenticated') {
		authResult.logout();
	}
	authResult = undefined;
	initPromise = undefined;
	cachedProfile = undefined;
	return {
		state: 'disconnected',
		configured: getPublicAppConfig().audiotool.configured,
		message: 'Disconnected.'
	};
}

/**
 * Upload a sample file to Audiotool.
 * Distinguishes byte upload (`uploaded`) from server processing (`ready`).
 * Local audio must stay until `ready` succeeds.
 */
export async function uploadSample(request: AudiotoolUploadRequest): Promise<{
	sampleName?: string;
	ready: boolean;
}> {
	const run = async (): Promise<{ sampleName?: string; ready: boolean }> => {
		await initAudiotoolClient();
		if (!authResult || authResult.status !== 'authenticated') {
			throw createAppError(
				'AUDIOTOOL_AUTH_FAILED',
				'Connect to Audiotool before uploading samples.',
				{ recoverable: true }
			);
		}

		if (request.signal?.aborted) {
			throw createAppError('UPLOAD_CANCELED', 'Upload canceled.', { recoverable: true });
		}

		const upload = await authResult.samples.upload(
			{
				file: request.file,
				displayName: request.metadata.displayName.trim(),
				description: request.metadata.description,
				tags: request.metadata.tags.length > 0 ? request.metadata.tags : ['recording'],
				kind: request.metadata.kind,
				visibility: request.metadata.visibility ?? 'unlisted',
				bpm: request.metadata.bpm,
				// App-level acquirePreventUnload already guards tab close during queue work.
				preventTabClose: false
			},
			request.signal
		);

		if (upload instanceof Error) {
			if (request.signal?.aborted) {
				throw createAppError('UPLOAD_CANCELED', 'Upload canceled.', {
					cause: upload,
					recoverable: true
				});
			}
			throw createAppError('UPLOAD_FAILED', upload.message, {
				cause: upload,
				recoverable: true,
				context: { displayName: request.metadata.displayName }
			});
		}

		const uploaded = await upload.uploaded;
		let uploadError: AppError | undefined;
		if (uploaded instanceof Error) {
			uploadError = request.signal?.aborted
				? createAppError('UPLOAD_CANCELED', 'Upload canceled.', {
						cause: uploaded,
						recoverable: true
					})
				: createAppError('UPLOAD_FAILED', uploaded.message, {
						cause: uploaded,
						recoverable: true
					});
		} else {
			await request.onBytesUploaded?.();
			await request.onProcessing?.();
		}

		// Always settle the Nexus handle (including cancelSampleUpload on failure)
		// before the next upload starts — otherwise server rate-limit slots leak.
		const ready = await upload.ready;
		if (uploadError) throw uploadError;

		if (ready instanceof Error) {
			if (request.signal?.aborted) {
				throw createAppError('UPLOAD_CANCELED', 'Upload canceled.', {
					cause: ready,
					recoverable: true
				});
			}
			throw createAppError('UPLOAD_FAILED', ready.message, {
				cause: ready,
				recoverable: true
			});
		}

		return {
			sampleName:
				typeof ready === 'object' && ready && 'name' in ready ? String(ready.name) : undefined,
			ready: true
		};
	};

	const result = uploadChain.then(run, run);
	uploadChain = result.catch(() => undefined);
	return result;
}
