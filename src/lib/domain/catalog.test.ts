import { describe, expect, it } from 'vitest';
import {
	SPECIMEN_MARK_SIZE,
	SPECIMEN_NEON_COUNT,
	deriveCatalogReference,
	deriveSpecimenMark,
	formatFieldSessionName,
	type SpecimenMarkInput
} from './catalog';

const UUID = '550e8400-e29b-41d4-a716-446655440000';

function specimenInput(overrides: Partial<SpecimenMarkInput['source']> = {}): SpecimenMarkInput {
	return {
		id: 'A1B2C3D4-E5F6-47A8-9012-3456789ABCDE',
		source: {
			durationSeconds: 3.25,
			byteLength: 48_000,
			channelCount: 2,
			...overrides
		}
	};
}

describe('deriveCatalogReference', () => {
	it('formats a stable reference from the session ID and sequence', () => {
		const input = { sessionId: UUID, sequence: 3 };

		expect(deriveCatalogReference(input)).toBe('550E84-003');
		expect(deriveCatalogReference(input)).toBe(deriveCatalogReference(input));
	});

	it('pads short sequences without truncating longer ones', () => {
		expect(deriveCatalogReference({ sessionId: UUID, sequence: 1 })).toBe('550E84-001');
		expect(deriveCatalogReference({ sessionId: UUID, sequence: 42 })).toBe('550E84-042');
		expect(deriveCatalogReference({ sessionId: UUID, sequence: 1234 })).toBe('550E84-1234');
	});

	it('normalizes arbitrary IDs and hashes when usable characters are insufficient', () => {
		expect(deriveCatalogReference({ sessionId: ' session_alpha ', sequence: 7 })).toBe(
			'SESSIO-007'
		);

		const fallbackReference = deriveCatalogReference({ sessionId: 'ø-!', sequence: 7 });
		expect(fallbackReference).toMatch(/^[A-Z0-9]{6}-007$/);
		expect(fallbackReference).toBe(deriveCatalogReference({ sessionId: 'ø-!', sequence: 7 }));
	});
});

describe('formatFieldSessionName', () => {
	it('returns the default Session title', () => {
		expect(formatFieldSessionName(new Date(2026, 6, 25, 21, 2))).toBe('Session');
		expect(formatFieldSessionName()).toBe('Session');
	});
});

describe('deriveSpecimenMark', () => {
	it('returns the same mark for the same canonical input', () => {
		const input = specimenInput();

		expect(deriveSpecimenMark(input)).toEqual(deriveSpecimenMark(input));
		expect(deriveSpecimenMark({ ...input, id: input.id.toLowerCase() })).toEqual(
			deriveSpecimenMark(input)
		);
	});

	it('changes with source facts while the catalog reference stays stable', () => {
		const catalogInput = { sessionId: UUID, sequence: 3 };
		const originalMark = deriveSpecimenMark(specimenInput());
		const changedMarks = [
			deriveSpecimenMark(specimenInput({ durationSeconds: 3.5 })),
			deriveSpecimenMark(specimenInput({ byteLength: 48_001 })),
			deriveSpecimenMark(specimenInput({ channelCount: 1 }))
		];

		for (const changedMark of changedMarks) {
			expect(changedMark).not.toEqual(originalMark);
		}
		expect(deriveCatalogReference(catalogInput)).toBe('550E84-003');
	});

	it('has fixed dimensions, a neon color index, and a usable mix of cells', () => {
		const mark = deriveSpecimenMark(specimenInput());
		const cells = mark.cells.flat();
		const activeCount = cells.filter(Boolean).length;

		expect(mark.width).toBe(SPECIMEN_MARK_SIZE);
		expect(mark.height).toBe(SPECIMEN_MARK_SIZE);
		expect(mark.cells).toHaveLength(SPECIMEN_MARK_SIZE);
		expect(mark.cells.every((row) => row.length === SPECIMEN_MARK_SIZE)).toBe(true);
		expect(mark.colorIndex).toBeGreaterThanOrEqual(0);
		expect(mark.colorIndex).toBeLessThan(SPECIMEN_NEON_COUNT);
		expect(activeCount).toBeGreaterThan(0);
		expect(activeCount).toBeLessThan(SPECIMEN_MARK_SIZE ** 2);
	});

	it('keeps the same color index for the same canonical input', () => {
		const input = specimenInput();
		expect(deriveSpecimenMark(input).colorIndex).toBe(deriveSpecimenMark(input).colorIndex);
	});
});
