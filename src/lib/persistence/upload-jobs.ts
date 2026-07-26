import { createAppError, createId, nowIso } from '$lib/domain/ids';
import type { TakeId, UploadJob, UploadJobId, UploadJobState } from '$lib/domain/types';
import { isActiveUploadJobState, isInFlightUploadJobState } from '$lib/domain/upload';
import { cloneForIdb } from './clone-for-idb';
import { getDatabase } from './db';

export async function putUploadJob(job: UploadJob): Promise<void> {
	await getDatabase().uploadJobs.put(cloneForIdb(job));
}

export async function getUploadJob(id: UploadJobId): Promise<UploadJob | undefined> {
	return getDatabase().uploadJobs.get(id);
}

export async function getUploadJobForTake(takeId: TakeId): Promise<UploadJob | undefined> {
	const jobs = await getDatabase().uploadJobs.where('takeId').equals(takeId).toArray();
	if (jobs.length === 0) return undefined;
	jobs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	return jobs[0];
}

export async function listUploadJobs(): Promise<UploadJob[]> {
	const jobs = await getDatabase().uploadJobs.toArray();
	jobs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
	return jobs;
}

export async function listActiveUploadJobs(): Promise<UploadJob[]> {
	const jobs = await listUploadJobs();
	return jobs.filter((job) => isActiveUploadJobState(job.state));
}

export async function listInFlightUploadJobs(): Promise<UploadJob[]> {
	const jobs = await listUploadJobs();
	return jobs.filter((job) => isInFlightUploadJobState(job.state));
}

export async function listQueuedUploadJobs(): Promise<UploadJob[]> {
	const jobs = await getDatabase().uploadJobs.where('state').equals('queued').toArray();
	jobs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
	return jobs;
}

export async function createUploadJob(takeId: TakeId): Promise<UploadJob> {
	const timestamp = nowIso();
	const job: UploadJob = {
		id: createId(),
		takeId,
		createdAt: timestamp,
		updatedAt: timestamp,
		state: 'queued',
		attempt: 1
	};
	await putUploadJob(job);
	return job;
}

export async function updateUploadJob(job: UploadJob): Promise<UploadJob> {
	const updated: UploadJob = { ...job, updatedAt: nowIso() };
	await putUploadJob(updated);
	return updated;
}

export async function patchUploadJob(
	id: UploadJobId,
	patch: Partial<Omit<UploadJob, 'id' | 'takeId' | 'createdAt'>>
): Promise<UploadJob> {
	const existing = await getUploadJob(id);
	if (!existing) {
		throw createAppError('UPLOAD_JOB_MISSING', `Upload job ${id} was not found.`, {
			recoverable: false,
			context: { jobId: id }
		});
	}
	return updateUploadJob({ ...existing, ...patch });
}

export async function setUploadJobState(
	id: UploadJobId,
	state: UploadJobState,
	extra: Partial<Omit<UploadJob, 'id' | 'takeId' | 'createdAt' | 'state'>> = {}
): Promise<UploadJob> {
	return patchUploadJob(id, { state, ...extra });
}

export async function deleteUploadJobsForTake(takeId: TakeId): Promise<void> {
	const jobs = await getDatabase().uploadJobs.where('takeId').equals(takeId).toArray();
	await getDatabase().uploadJobs.bulkDelete(jobs.map((job) => job.id));
}
