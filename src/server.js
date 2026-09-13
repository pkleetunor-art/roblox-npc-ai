import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { createPool } from './db.js';
import { Repository } from './repository.js';
import { AIAdapter } from './ai.js';
import { SocialService } from './socialService.js';
import { createHttpHandler } from './httpApp.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const pool = createPool({ connectionString: required('DATABASE_URL') });

if (process.env.AUTO_MIGRATE !== 'false') {
  const schema = await readFile(resolve(root, 'schema.sql'), 'utf8');
  await pool.query(schema);
  console.log('[npc-ai] database schema ready');
}

const repository = new Repository(pool);
const ai = new AIAdapter({
  apiKey: required('OPENAI_API_KEY'),
  model: process.env.OPENAI_MODEL || 'gpt-5.6-luna',
});
const service = new SocialService({ repository, ai });
const handler = createHttpHandler({
  service,
  authToken: required('BACKEND_AUTH_TOKEN'),
});

const port = Number(process.env.PORT || 3000);
const server = createServer(handler);
server.listen(port, '0.0.0.0', () => {
  console.log(`[npc-ai] listening on port ${port}`);
});

async function shutdown(signal) {
  console.log(`[npc-ai] ${signal}; shutting down`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
