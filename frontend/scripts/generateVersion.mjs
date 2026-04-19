/**
 * Generate public/version.json at build time.
 * Each build emits a unique buildId + commit + builtAt so the running
 * client can detect when it's behind production and force a reload.
 */
import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(__dirname, '..', 'public', 'version.json');

let commit = 'unknown';
try {
  commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim();
} catch {
  // no git or not a repo — buildId is still unique
}

const payload = {
  buildId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  commit,
  builtAt: new Date().toISOString(),
};

writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n');
console.log(`[version] → ${outPath}`, payload);
