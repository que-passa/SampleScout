#!/usr/bin/env node
/**
 * Gate shell commands that invent a backend, leak secrets, or use localhost for OAuth.
 * Reads Cursor hook JSON from stdin; writes permission JSON to stdout.
 */
import { readFileSync } from 'node:fs';

const input = JSON.parse(readFileSync(0, 'utf8'));
const command = String(input.command ?? '');

const denyPatterns = [
	{
		re: /\bgit\s+add\b.*(\.env\b|credentials\.json|id_rsa|\.pem\b)/i,
		user: 'Blocked: staging secret-like files is not allowed.',
		agent:
			'Do not git-add .env, credentials, or private keys. Use .env.example for public placeholders only.'
	},
	{
		re: /\becho\b.*\b(AUDIOTOOL_.*TOKEN|PAT|PRIVATE_KEY)\b.*>/i,
		user: 'Blocked: writing secret-like values via shell redirect.',
		agent: 'Never write PATs or private keys into the repo. Audiotool uses public OAuth PKCE only.'
	}
];

const askPatterns = [
	{
		re: /\+server\.(ts|js)\b|src\/routes\/api\b|adapter-node|adapter-vercel|adapter-netlify|wrangler|serverless/i,
		user: 'This may add a backend. SampleScout is static/client-only — please confirm.',
		agent:
			'SampleScout forbids custom backends (+server.ts, serverless adapters). Prefer client-only $lib modules. Confirm with the user before proceeding.'
	},
	{
		re: /localhost:5173|http:\/\/localhost\b/i,
		user: 'localhost detected. SampleScout OAuth expects 127.0.0.1 — please confirm.',
		agent: 'Use http://127.0.0.1:5173 (not localhost) for Audiotool OAuth redirect registration.'
	}
];

function respond(permission, user_message, agent_message) {
	process.stdout.write(JSON.stringify({ permission, user_message, agent_message }) + '\n');
	process.exit(0);
}

for (const p of denyPatterns) {
	if (p.re.test(command)) {
		respond('deny', p.user, p.agent);
	}
}

for (const p of askPatterns) {
	if (p.re.test(command)) {
		respond('ask', p.user, p.agent);
	}
}

respond('allow');
