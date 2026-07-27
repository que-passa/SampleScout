import { describe, expect, it } from 'vitest';
import {
	DEFAULT_SESSION_NAME,
	SESSION_NAME_PRESETS,
	SESSION_NAME_PRESET_LIMIT,
	isBuiltInSessionPreset,
	normalizeSessionName,
	rememberSessionNamePreset
} from './session-name';

describe('session name defaults and presets', () => {
	it('defaults to Session', () => {
		expect(DEFAULT_SESSION_NAME).toBe('Session');
		expect(normalizeSessionName('')).toBe('Session');
		expect(normalizeSessionName('   ')).toBe('Session');
		expect(SESSION_NAME_PRESETS).toHaveLength(21);
		expect(SESSION_NAME_PRESET_LIMIT).toBe(12);
	});

	it('normalizes dashes and whitespace', () => {
		expect(normalizeSessionName('  Rain\u2014alley  ')).toBe('Rain alley');
	});

	it('detects built-in presets case-insensitively', () => {
		expect(isBuiltInSessionPreset('Forest')).toBe(true);
		expect(isBuiltInSessionPreset('forest')).toBe(true);
		expect(isBuiltInSessionPreset('My Spot')).toBe(false);
	});

	it('remembers custom presets with FIFO and dedupe', () => {
		expect(rememberSessionNamePreset([], 'Forest')).toEqual([]);
		expect(rememberSessionNamePreset([], 'Session')).toEqual([]);
		expect(rememberSessionNamePreset([], 'Alley')).toEqual(['Alley']);

		const once = rememberSessionNamePreset(['Alley', 'Bridge'], 'Alley');
		expect(once).toEqual(['Alley', 'Bridge']);

		const many = Array.from({ length: 12 }, (_, i) => `Custom ${i + 1}`);
		const next = rememberSessionNamePreset(many, 'Newest');
		expect(next).toHaveLength(12);
		expect(next[0]).toBe('Newest');
		expect(next[11]).toBe('Custom 11');
		expect(next).not.toContain('Custom 12');
	});
});
