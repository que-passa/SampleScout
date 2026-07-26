#!/usr/bin/env node
/**
 * Gate file writes that invent SvelteKit server endpoints or embed secrets.
 * Reads Cursor hook JSON from stdin; writes permission JSON to stdout.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8'));
const toolName = String(input.tool_name ?? input.toolName ?? '');
const toolInput = input.tool_input ?? input.arguments ?? input ?? {};
const path = String(
	toolInput.path ?? toolInput.file_path ?? toolInput.filePath ?? toolInput.target_notebook ?? ''
);
const contents = String(
	toolInput.contents ?? toolInput.new_string ?? toolInput.newString ?? toolInput.content ?? ''
);

function respond(permission, user_message, agent_message) {
	process.stdout.write(JSON.stringify({ permission, user_message, agent_message }) + '\n');
	process.exit(0);
}

const base = basename(path);

if (/\+server\.(ts|js)$/.test(base) || /\/routes\/api\//.test(path.replace(/\\/g, '/'))) {
	respond(
		'deny',
		'Blocked: SampleScout has no server endpoints.',
		'Do not create +server.ts or /routes/api. Keep logic in client $lib modules. See AGENTS.md.'
	);
}

if (/(^|\/)\.env$/.test(path.replace(/\\/g, '/')) && !path.includes('.env.example')) {
	respond(
		'ask',
		'Editing .env may contain secrets — confirm before continuing.',
		'Prefer documenting public vars in .env.example. Never commit PATs or private keys.'
	);
}

const secretLike =
	/\b(AUDIOTOOL_.*(?:PAT|TOKEN|SECRET)|PERSONAL_ACCESS_TOKEN|BEGIN\s+PRIVATE\s+KEY)\b/i;
if (secretLike.test(contents)) {
	respond(
		'deny',
		'Blocked: secret-like content in a write.',
		'Audiotool integration uses public OAuth PKCE only (PUBLIC_AUDIOTOOL_*). Never embed PATs or private keys.'
	);
}

// Allow unrelated tools through quietly.
if (!path && !/Write|Edit|StrReplace|Delete/i.test(toolName)) {
	respond('allow');
}

respond('allow');
