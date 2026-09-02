#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const args = process.argv.slice(2);
if (args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
  printHelp();
  process.exit(0);
}
const command = args[0]?.startsWith('-') ? 'start' : (args.shift() ?? 'start');

if (command !== 'start' && command !== 'dev') {
  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(1);
}

if (
  command === 'start' &&
  !existsSync(path.join(packageRoot, '.next', 'BUILD_ID'))
) {
  console.error('Praxis has not been built yet.');
  console.error(`Run: cd ${packageRoot} && npm install && npm run build`);
  process.exit(1);
}

const nextBinary = path.join(
  packageRoot,
  'node_modules',
  'next',
  'dist',
  'bin',
  'next',
);
if (!existsSync(nextBinary)) {
  console.error('Praxis dependencies are missing.');
  console.error(`Run: cd ${packageRoot} && npm install`);
  process.exit(1);
}

const nextCommand = command === 'dev' ? 'dev' : 'start';
const child = spawn(process.execPath, [nextBinary, nextCommand, ...args], {
  cwd: packageRoot,
  env: process.env,
  stdio: 'inherit',
});

child.on('error', (error) => {
  console.error(`Could not start Praxis: ${error.message}`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

function printHelp() {
  console.log(`Praxis

Usage:
  praxis [start] [Next.js options]
  praxis dev [Next.js options]

Examples:
  praxis
  praxis --port 3100
  praxis dev --port 3100`);
}
