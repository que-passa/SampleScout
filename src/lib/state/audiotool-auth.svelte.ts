import {
	connectAudiotool,
	disconnectAudiotool,
	getAudiotoolAuthStatus,
	initAudiotoolClient,
	type AudiotoolAuthStatus
} from '$lib/audiotool';

/**
 * Shared Audiotool auth state. Mutate properties; do not reassign this export.
 */
export const audiotoolAuth = $state({
	status: getAudiotoolAuthStatus(),
	ready: false,
	busy: false
});

function applyStatus(status: AudiotoolAuthStatus) {
	audiotoolAuth.status = status;
}

export async function hydrateAudiotoolAuth(): Promise<AudiotoolAuthStatus> {
	const status = await initAudiotoolClient();
	applyStatus(status);
	audiotoolAuth.ready = true;
	return status;
}

export async function connect(): Promise<AudiotoolAuthStatus> {
	audiotoolAuth.busy = true;
	try {
		const status = await connectAudiotool();
		applyStatus(status);
		return status;
	} finally {
		audiotoolAuth.busy = false;
	}
}

export async function disconnect(): Promise<AudiotoolAuthStatus> {
	audiotoolAuth.busy = true;
	try {
		const status = await disconnectAudiotool();
		applyStatus(status);
		return status;
	} finally {
		audiotoolAuth.busy = false;
	}
}
