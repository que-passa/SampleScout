import type { AppError } from './types';

export function createId(): string {
	return crypto.randomUUID();
}

export function nowIso(): string {
	return new Date().toISOString();
}

export function createAppError(
	code: string,
	message: string,
	options: {
		recoverable?: boolean;
		cause?: unknown;
		context?: Record<string, string | number | boolean>;
	} = {}
): AppError {
	return {
		code,
		message,
		recoverable: options.recoverable ?? true,
		cause: options.cause,
		context: options.context,
		occurredAt: nowIso()
	};
}

export function formatSequence(sequence: number): string {
	return String(sequence).padStart(3, '0');
}
