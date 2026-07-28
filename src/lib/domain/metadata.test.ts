import { describe, expect, it } from 'vitest';
import {
		applyGeneratedTags,
		applyTakeMetadataPatch,
		canApplyGeneratedTags,
		generatedTagsForMetadata,
	assignNumberedDisplayNames,
	createSession,
	formatNumberedDisplayName,
	formatShortDate,
	formatShortDateTime,
	formatTagList,
	generateTakeMetadata,
	isPendingFileTake,
	isTakeSavedLocally,
	isUploadPendingTake,
	nextNumberedDisplayName,
	parseNumberedDisplayName,
	parseTagList,
	stemFromSessionName,
	takeHasCollectedChildren
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

describe('formatShortDate / formatShortDateTime', () => {
	it('formats dd/mm and dd/mm/hh:mm from local calendar parts', () => {
		const iso = '2026-07-27T15:41:00';
		expect(formatShortDate(iso)).toBe('27/07');
		expect(formatShortDateTime(iso)).toBe('27/07/15:41');
	});

	it('returns empty string for invalid dates', () => {
		expect(formatShortDate('not-a-date')).toBe('');
		expect(formatShortDateTime('not-a-date')).toBe('');
	});
});

describe('numbered display names', () => {
	it('builds short stems from Field Session titles', () => {
		expect(stemFromSessionName('Field Session · 25 Jul 2026 · 21:02')).toBe('25 Jul');
		expect(stemFromSessionName('Door hits')).toBe('Door hits');
		expect(stemFromSessionName('Session')).toBe('Session');
	});

	it('defaults createSession name to Session', () => {
		expect(createSession().name).toBe('Session');
	});

	it('formats and parses Stem NN without dashes', () => {
		expect(formatNumberedDisplayName('Rain', 1)).toBe('Rain 01');
		expect(formatNumberedDisplayName('Rain', 12)).toBe('Rain 12');
		expect(parseNumberedDisplayName('Rain 03')).toEqual({ stem: 'Rain', number: 3 });
		expect(nextNumberedDisplayName('Rain', ['Rain 01', 'Rain 02'])).toBe('Rain 03');
		expect(nextNumberedDisplayName('Door', ['Rain 03'])).toBe('Door 01');
		expect(assignNumberedDisplayNames('Rain', 2)).toEqual(['Rain 01', 'Rain 02']);
		expect(formatNumberedDisplayName('A—B', 1)).toBe('A B 01');
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

		expect(metadata.displayName).toBe('Door hits 01');
		expect(metadata.displayName).not.toMatch(/[—–]/);
		expect(metadata.description).toContain('Door hits');
		expect(metadata.description).toContain('Take 003');
		expect(metadata.kind).toBe('one-shot');
		expect(metadata.visibility).toBe('unlisted');
		expect(metadata.tags).toEqual([]);
		expect(metadata.provenance.displayName).toBe('generated');
		expect(metadata.provenance.kind).toBe('application-default');
		expect(metadata.provenance.visibility).toBe('application-default');
	});

	it('continues numbering from existing session names', () => {
		const session = createSession('Door hits');
		const metadata = generateTakeMetadata({
			sessionName: session.name,
			sequence: 2,
			recordedAt: '2026-07-25T10:00:00.000Z',
			sessionDefaults: session.defaults,
			existingDisplayNames: ['Door hits 01']
		});
		expect(metadata.displayName).toBe('Door hits 02');
	});

	it('prefers session tags over an empty default', () => {
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

describe('generated tags', () => {
	it('canApplyGeneratedTags allows generic defaults and prior generated tags', () => {
		const session = createSession('Rain');
		const metadata = generateTakeMetadata({
			sessionName: session.name,
			sequence: 1,
			recordedAt: '2026-07-25T10:00:00.000Z',
			sessionDefaults: session.defaults
		});
		expect(canApplyGeneratedTags(metadata)).toBe(true);

		const manual = applyTakeMetadataPatch(metadata, { tags: ['custom'] });
		expect(canApplyGeneratedTags(manual)).toBe(false);
	});

	it('applyGeneratedTags replaces tags and marks provenance generated', () => {
		const session = createSession('Rain');
		const metadata = generateTakeMetadata({
			sessionName: session.name,
			sequence: 1,
			recordedAt: '2026-07-25T10:00:00.000Z',
			sessionDefaults: session.defaults
		});

		const next = applyGeneratedTags(metadata, ['rain', 'thunder'], 1);
		expect(next?.tags).toEqual(['rain', 'thunder']);
		expect(next?.provenance.tags).toBe('generated');
		expect(next?.provenance.generatedTagSnapshot).toEqual(['rain', 'thunder']);
		expect(next?.provenance.tagsAlgorithmVersion).toBe(1);
	});

	it('generatedTagsForMetadata keeps snapshot after manual tag edits', () => {
		const session = createSession('Rain');
		const metadata = generateTakeMetadata({
			sessionName: session.name,
			sequence: 1,
			recordedAt: '2026-07-25T10:00:00.000Z',
			sessionDefaults: session.defaults
		});
		const generated = applyGeneratedTags(metadata, ['rain', 'thunder'], 1)!;
		const edited = applyTakeMetadataPatch(generated, { tags: ['rain', 'thunder', 'custom'] });

		expect(edited.provenance.tags).toBe('manual');
		expect(generatedTagsForMetadata(edited)).toEqual(['rain', 'thunder']);
	});

	it('canApplyGeneratedTags skips current generated tags unless forced or stale', () => {
		const session = createSession('Rain');
		const metadata = generateTakeMetadata({
			sessionName: session.name,
			sequence: 1,
			recordedAt: '2026-07-25T10:00:00.000Z',
			sessionDefaults: session.defaults
		});
		const generated = applyGeneratedTags(metadata, ['rain'], 2);
		expect(canApplyGeneratedTags(generated!)).toBe(false);
		expect(canApplyGeneratedTags(generated!, { force: true })).toBe(true);
		expect(canApplyGeneratedTags(generated!, { algorithmVersion: 3 })).toBe(true);
	});

	it('applyGeneratedTags skips session-default tags', () => {
		const session = createSession('Field');
		session.defaults.tags = ['field'];
		const metadata = generateTakeMetadata({
			sessionName: session.name,
			sequence: 1,
			recordedAt: '2026-07-25T10:00:00.000Z',
			sessionDefaults: session.defaults
		});

		expect(applyGeneratedTags(metadata, ['rain'], 1)).toBeNull();
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

describe('isPendingFileTake', () => {
	it('requires a locally saved take that is not uploaded', () => {
		const take = {
			lifecycleState: 'saved',
			uploadState: 'not-queued',
			source: { fileRef: 'sessions/a/takes/b/source.bin' }
		} as Take;

		expect(isPendingFileTake(take)).toBe(true);

		take.uploadState = 'uploaded';
		expect(isPendingFileTake(take)).toBe(false);

		take.uploadState = 'failed';
		expect(isPendingFileTake(take)).toBe(true);

		take.lifecycleState = 'finalizing';
		expect(isPendingFileTake(take)).toBe(false);
	});
});

describe('isUploadPendingTake', () => {
	it('excludes parents that have collected children', () => {
		const parent = {
			id: 'parent',
			lifecycleState: 'saved',
			uploadState: 'not-queued',
			source: { fileRef: 'sessions/a/takes/p/source.bin' }
		} as Take;
		const child = {
			id: 'child',
			derivedFromTakeId: 'parent',
			lifecycleState: 'saved',
			uploadState: 'not-queued',
			source: { fileRef: 'sessions/a/takes/p/source.bin' }
		} as Take;
		const lone = {
			id: 'lone',
			lifecycleState: 'saved',
			uploadState: 'not-queued',
			source: { fileRef: 'sessions/a/takes/l/source.bin' }
		} as Take;

		const all = [parent, child, lone];
		expect(takeHasCollectedChildren('parent', all)).toBe(true);
		expect(isUploadPendingTake(parent, all)).toBe(false);
		expect(isUploadPendingTake(child, all)).toBe(true);
		expect(isUploadPendingTake(lone, all)).toBe(true);
	});
});
