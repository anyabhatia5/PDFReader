/**
 * One-command local setup: `npm run setup`.
 *
 * Written in plain Node (no shell syntax) so it behaves identically on
 * macOS, Linux and Windows. Steps:
 *   1. create .env files from their .env.example templates (if missing)
 *   2. install npm dependencies for the root, backend and frontend
 *   3. start PostgreSQL in Docker and wait until it is healthy
 *   4. apply database migrations
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apps = ['backend', 'frontend'].filter((app) => existsSync(path.join(root, app)));

/**
 * Runs a fixed command line from the repo root and stops setup if it fails.
 * A shell is used so Windows can resolve `npm` to npm.cmd; only hard-coded
 * commands are ever passed in, never user input.
 */
function run(commandLine) {
  console.log(`\n> ${commandLine}`);
  const result = spawnSync(commandLine, { cwd: root, stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    console.error(`\nSetup failed while running: ${commandLine}`);
    process.exit(result.status ?? 1);
  }
}

// Fail early with a helpful message if Docker is missing or not started,
// instead of halfway through with Docker's low-level connection error.
const docker = spawnSync('docker info', { stdio: 'ignore', shell: true });
if (docker.status !== 0) {
  console.error(
    'Docker is not available. Install Docker Desktop (or Docker Engine on Linux), ' +
      'make sure it is running, then run `npm run setup` again.',
  );
  process.exit(1);
}

for (const app of apps) {
  const example = path.join(root, app, '.env.example');
  const target = path.join(root, app, '.env');
  if (existsSync(example) && !existsSync(target)) {
    copyFileSync(example, target);
    console.log(`Created ${app}/.env from .env.example`);
  }
}

run('npm install');
for (const app of apps) {
  run(`npm --prefix ${app} install`);
}
run('npm run db:up');
run('npm run migrate');

console.log('\nSetup complete. Start the app with: npm run dev');
