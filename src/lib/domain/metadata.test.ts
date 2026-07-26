import { describe, expect, it } from 'vitest';
import {
	applyTakeMetadataPatch,
	createSession,
	formatTagList,
	generateTakeMetadata,
	isPendingDraftTake,
	isTakeSavedLocally,
	parseTagList
} from './metadata';
import { formatSequence } from './ids';
import type { Take } from './types';

describe('formatSequence', () => {
	it('pads to three digits', () => {
		expect(formatSequence(1)).toBe('001');
		expect(formatSequence(42)).toBe('042');
		expect(formatSequence(100)).toBe('100');
	});
});

describe('generateTakeMetadata', () => {
	it('builds generated name and description with unlisted one-shot defaults', () => {
		const session = createSession('Door hits');
		const metadata = generateTakeMetadata({
			sessionName: session.name,
			sequence: 3,
			recordedAt: '2026-07-25T10:00:00.000Z',
			sessionDefaults: session.defaults
		});

		expect(metadata.displayName).toBe('Door hits — 003');
		expect(metadata.description).toContain('Door hits');
		expect(metadata.description).toContain('Take 003');
		expect(metadata.kind).toBe('one-shot');
		expect(metadata.visibility).toBe('unlisted');
		expect(metadata.tags).toEqual(['recording']);
		expect(metadata.provenance.displayName).toBe('generated');
		expect(metadata.provenance.kind).toBe('application-default');
		expect(metadata.provenance.visibility).toBe('application-default');
	});

	it('prefers session tags over the recording fallback', () => {
		const session = createSession('Loops');
		session.defaults.tags = ['field', 'metal'];
		session.defaults.kind = 'loop';
		session.defaults.visibility = 'public';
		session.defaults.bpm = 120;

		const metadata = generateTakeMetadata({
			sessionName: session.name,
			sequence: 1,
			recordedAt: '2026-07-25T10:00:00.000Z',
			sessionDefaults: session.defaults
		});

		expect(metadata.tags).toEqual(['field', 'metal']);
		expect(metadata.provenance.tags).toBe('session-default');
		expect(metadata.kind).toBe('loop');
		expect(metadata.visibility).toBe('public');
		expect(metadata.bpm).toBe(120);
	});
});

describe('parseTagList / formatTagList', () => {
	it('splits and dedupes tags', () => {
		expect(parseTagList('field, metal; field\nwood')).toEqual(['field', 'metal', 'wood']);
		expect(formatTagList(['field', 'metal'])).toBe('field, metal');
	});
});

describe('applyTakeMetadataPatch', () => {
	it('marks changed fields as manual and leaves omitted fields alone', () => {
		const session = createSession('Door hits');
		const metadata = generateTakeMetadata({
			sessionName: session.name,
			sequence: 1,
			recordedAt: '2026-07-25T10:00:00.000Z',
			sessionDefaults: session.defaults
		});

		const next = applyTakeMetadataPatch(metadata, {
			description: 'Custom note',
			visibility: 'public'
		});

		expect(next.description).toBe('Custom note');
		expect(next.provenance.description).toBe('manual');
		expect(next.visibility).toBe('public');
		expect(next.provenance.visibility).toBe('manual');
		expect(next.displayName).toBe(metadata.displayName);
		expect(next.provenance.displayName).toBe('generated');
		expect(next.kind).toBe('one-shot');
		expect(next.provenance.kind).toBe('application-default');
	});

	it('clears bpm when switching to one-shot', () => {
		const session = createSession('Loops');
		session.defaults.kind = 'loop';
		session.defaults.bpm = 128;
		const metadata = generateTakeMetadata({
			sessionName: session.name,
			sequence: 1,
			recordedAt: '2026-07-25T10:00:00.000Z',
			sessionDefaults: session.defaults
		});

		const next = applyTakeMetadataPatch(metadata, { kind: 'one-shot' });
		expect(next.kind).toBe('one-shot');
		expect(next.bpm).toBeUndefined();
		expect(next.provenance.bpm).toBeUndefined();
		expect(next.provenance.kind).toBe('manual');
	});

	it('sets loop bpm as manual', () => {
		const session = createSession('Loops');
		session.defaults.kind = 'loop';
		const metadata = generateTakeMetadata({
			sessionName: session.name,
			sequence: 1,
			recordedAt: '2026-07-25T10:00:00.000Z',
			sessionDefaults: session.defaults
		});

		const next = applyTakeMetadataPatch(metadata, { bpm: 90 });
		expect(next.bpm).toBe(90);
		expect(next.provenance.bpm).toBe('manual');
	});
});

describe('isTakeSavedLocally', () => {
	it('requires saved lifecycle and a file ref', () => {
		const take = {
			lifecycleState: 'finalizing',
			source: { fileRef: 'sessions/a/takes/b/source.bin' }
		} as Take;

		expect(isTakeSavedLocally(take)).toBe(false);

		take.lifecycleState = 'saved';
		expect(isTakeSavedLocally(take)).toBe(true);

		take.source.fileRef = '';
		expect(isTakeSavedLocally(take)).toBe(false);
	});
});

describe('isPendingDraftTake', () => {
	it('requires a locally saved take that is not uploaded', () => {
		const take = {
			lifecycleState: 'saved',
			uploadState: 'not-queued',
			source: { fileRef: 'sessions/a/takes/b/source.bin' }
		} as Take;

		expect(isPendingDraftTake(take)).toBe(true);

		take.uploadState = 'uploaded';
		expect(isPendingDraftTake(take)).toBe(false);

		take.uploadState = 'failed';
		expect(isPendingDraftTake(take)).toBe(true);

		take.lifecycleState = 'finalizing';
		expect(isPendingDraftTake(take)).toBe(false);
	});
});
