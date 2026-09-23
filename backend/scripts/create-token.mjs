import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { pathToFileURL } from 'node:url';
const tokenModelUrl = pathToFileURL(path.join(__dirname, '..', 'models', 'token.model.js')).href;
const { TokenModel } = await import(tokenModelUrl);

// CLI: node create-token.mjs --name="My Token" --expires="2026-12-31T00:00:00Z" or --expires=never
const argv = process.argv.slice(2);
const args = Object.fromEntries(argv.map(a => {
	const [k, v] = a.split('=');
	return [k.replace(/^--/, ''), v || true];
}));

const name = args.name || `script-token-${Date.now()}`;
let expiresAt = null;
if (args.expires && String(args.expires).toLowerCase() !== 'never') {
	// if a date is provided, try to parse ISO or simple date
	const parsed = new Date(String(args.expires));
	if (!Number.isNaN(parsed.getTime())) expiresAt = parsed.toISOString();
}

const token = TokenModel.create({ name, scopes: ['tasks:create'], expiresAt });
console.log('Created token:');
console.log(JSON.stringify(token, null, 2));
process.exit(0);
