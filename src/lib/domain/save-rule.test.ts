import { describe, expect, it } from 'vitest';
import { createSession, createTakeDraft } from '$lib/domain/metadata';
import { isTakeSavedLocally } from '$lib/domain/metadata';
import { sourcePath } from '$lib/persistence/paths';

describe('take save labeling', () => {
	it('does not label a draft as saved before commit', () => {
		const session = createSession('Gate');
		const draft = createTakeDraft({
			session,
			sequence: 1,
			source: {
				fileRef: '',
				mimeType: 'audio/webm',
				byteLength: 0,
				durationSeconds: 1.25,
				sourceType: 'recording',
				recorderMimeType: 'audio/webm;codecs=opus'
			}
		});

		expect(draft.lifecycleState).toBe('finalizing');
		expect(isTakeSavedLocally(draft)).toBe(false);

		const saved = {
			...draft,
			lifecycleState: 'saved' as const,
			source: {
				...draft.source,
				fileRef: sourcePath(session.id, draft.id),
				byteLength: 2048
			}
		};

		expect(isTakeSavedLocally(saved)).toBe(true);
	});
});
