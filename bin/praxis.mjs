#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const DEFAULT_PORT = 3000;
const READY_PATTERN = /ready/i;
const DEFAULT_READY_TIMEOUT_MS = 10_000;
const STOP_GRACE_MS = 5_000;
const LOG_TAIL_BYTES = 256 * 1024;

await main(process.argv.slice(2));

async function main(rawArgs) {
  if (
    rawArgs.length === 0 ||
    rawArgs[0] === 'help' ||
    rawArgs[0] === '--help' ||
    rawArgs[0] === '-h'
  ) {
    printHelp();
    return;
  }
  const parsed = parseArgs(rawArgs);
  switch (parsed.command) {
    case 'start':
    case 'dev':
      await startServer(parsed, null);
      return;
    case 'stop':
      await stopServer(parsed.port);
      return;
    case 'restart':
      await restartServer(parsed);
      return;
    case 'status':
      printStatus(parsed.portGiven ? parsed.port : undefined);
      return;
    case 'logs':
      await printLogs(parsed);
      return;
    default:
      console.error(`Unknown command: ${parsed.command}`);
      printHelp();
      process.exit(1);
  }
}

function parseArgs(argv) {
  const command =
    argv[0]?.startsWith('-') || argv[0] === '--' ? 'start' : argv.shift();
  const result = {
    command,
    detach: false,
    follow: false,
    port: DEFAULT_PORT,
    portGiven: false,
    hostname: null,
    lines: 50,
    nextArgs: [],
  };
  const forwardsArgs = result.command === 'start' || result.command === 'dev';
  const unexpected = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') {
      if (!forwardsArgs && index + 1 < argv.length) unexpected.push('--');
      else result.nextArgs.push(...argv.slice(index + 1));
      break;
    }
    if (arg === '-d' || arg === '--detach') {
      result.detach = true;
    } else if (arg === '-f' || arg === '--follow') {
      result.follow = true;
    } else if (arg === '-n' || arg === '--lines') {
      index += 1;
      result.lines = readCount(argv[index]);
    } else if (arg.startsWith('--lines=')) {
      result.lines = readCount(arg.slice('--lines='.length));
    } else if (
      arg === '-p' ||
      arg === '--port' ||
      arg.startsWith('--port=') ||
      arg === '-H' ||
      arg === '--hostname' ||
      arg.startsWith('--hostname=')
    ) {
      index = consumeAddress(arg, argv, index, result, forwardsArgs);
    } else if (forwardsArgs) {
      result.nextArgs.push(arg);
    } else {
      unexpected.push(arg);
    }
  }
  if (unexpected.length > 0) {
    fail(
      `Unexpected argument for '${result.command}': ${unexpected.join(' ')}`,
    );
  }
  if (result.command === 'restart' && result.follow) {
    fail("'restart' does not accept --follow.");
  }
  if (
    (result.command === 'stop' || result.command === 'status') &&
    (result.detach || result.follow || result.nextArgs.length > 0)
  ) {
    fail(`Unexpected argument for '${result.command}'.`);
  }
  return result;
}

function consumeAddress(arg, argv, index, result, forward) {
  const push = (...values) => {
    if (forward) result.nextArgs.push(arg, ...values);
  };
  if (arg === '-p' || arg === '--port') {
    const value = argv[index + 1];
    if (value === undefined) fail('Missing value for --port.');
    result.port = readPort(value);
    result.portGiven = true;
    push(value);
    return index + 1;
  }
  if (arg.startsWith('--port=')) {
    result.port = readPort(arg.slice('--port='.length));
    result.portGiven = true;
    if (forward) result.nextArgs.push(arg);
    return index;
  }
  if (arg === '-H' || arg === '--hostname') {
    const value = argv[index + 1];
    result.hostname = readValue(value, 'hostname');
    push(value);
    return index + 1;
  }
  result.hostname = readValue(arg.slice('--hostname='.length), 'hostname');
  if (forward) result.nextArgs.push(arg);
  return index;
}

function readPort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    fail(`Invalid port: ${value ?? '(missing)'}`);
  }
  return port;
}

function readValue(value, name) {
  if (value === undefined || value === '') fail(`Missing value for ${name}.`);
  return value;
}

function readCount(value) {
  const count = Number(value);
  if (!Number.isInteger(count) || count < 0) {
    fail(`Invalid line count: ${value ?? '(missing)'}`);
  }
  return count;
}

function praxisHome() {
  if (process.env.PRAXIS_HOME) return path.resolve(process.env.PRAXIS_HOME);
  return path.join(homedir(), '.praxis');
}

function runDir() {
  return path.join(praxisHome(), 'run');
}

function statePath(port) {
  return path.join(runDir(), `praxis-${port}.json`);
}

function logPath(port) {
  return path.join(runDir(), `praxis-${port}.log`);
}

function readState(port) {
  const file = statePath(port);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function listStates() {
  if (!existsSync(runDir())) return [];
  return readdirSync(runDir())
    .filter((name) => /^praxis-\d+\.json$/.test(name))
    .map((name) =>
      readState(Number(name.slice('praxis-'.length, -'.json'.length))),
    )
    .filter((state) => state && Number.isInteger(state.port));
}

function isAlive(pid) {
  if (!Number.isInteger(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readyTimeoutMs() {
  const raw = process.env.PRAXIS_READY_TIMEOUT_MS;
  if (raw === undefined || raw === '') return DEFAULT_READY_TIMEOUT_MS;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) return DEFAULT_READY_TIMEOUT_MS;
  return value;
}

function processStartMarker(pid) {
  if (!Number.isInteger(pid)) return null;
  try {
    const result = spawnSync('ps', ['-p', String(pid), '-o', 'lstart='], {
      encoding: 'utf8',
    });
    if (result.status !== 0) return null;
    const marker = result.stdout.trim();
    return marker === '' ? null : marker;
  } catch {
    return null;
  }
}

function verifyState(state) {
  if (!state || !isAlive(state.pid)) return 'dead';
  if (typeof state.startMarker !== 'string') return 'mismatch';
  const marker = processStartMarker(state.pid);
  if (marker === null) return 'unknown';
  return marker === state.startMarker ? 'live' : 'mismatch';
}

async function killTree(pid) {
  if (!isAlive(pid)) return;
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return;
  }
  if (await waitForGone(pid, STOP_GRACE_MS)) return;
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    return;
  }
  await waitForGone(pid, STOP_GRACE_MS);
}

async function waitForGone(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return true;
    await sleep(100);
  }
  return !isAlive(pid);
}

function describeTarget(port) {
  return `port ${port}`;
}

async function startServer(parsed, stored) {
  const mode = parsed.command === 'dev' ? 'dev' : 'start';
  const detach = parsed.detach || stored?.detached === true;
  const port = parsed.port ?? stored?.port ?? DEFAULT_PORT;
  const hostname = parsed.hostname ?? stored?.hostname ?? null;
  const nextArgs = stored ? [...stored.nextArgs] : [...parsed.nextArgs];
  const stub = process.env.PRAXIS_SERVER_STUB;

  const existing = readState(port);
  if (existing) {
    const verdict = verifyState(existing);
    if (verdict === 'live') {
      fail(
        `Praxis is already running on ${describeTarget(port)} (pid ${existing.pid}).\n` +
          `Run 'praxis stop --port ${port}' first, or pick another port.`,
      );
    }
    if (verdict === 'unknown') {
      fail(
        `Cannot verify the process recorded for ${describeTarget(port)} (pid ${existing.pid}); refusing to replace it.\n` +
          `Inspect it manually, or remove ${statePath(port)} once you are sure it is not Praxis.`,
      );
    }
    rmSync(statePath(port), { force: true });
  }

  let server;
  if (stub) {
    server = { command: process.execPath, args: [stub] };
  } else {
    if (
      mode === 'start' &&
      !existsSync(path.join(packageRoot, '.next', 'BUILD_ID'))
    ) {
      fail(
        'Praxis has not been built yet.\n' +
          `Run: cd ${packageRoot} && npm install && npm run build`,
      );
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
      fail(
        'Praxis dependencies are missing.\n' +
          `Run: cd ${packageRoot} && npm install`,
      );
    }
    server = {
      command: process.execPath,
      args: [nextBinary, mode, ...nextArgs],
    };
  }

  mkdirSync(runDir(), { recursive: true });
  const logOffset = existsSync(logPath(port))
    ? statSync(logPath(port)).size
    : 0;
  if (detach) {
    const logFd = openSync(logPath(port), 'a');
    const child = spawn(server.command, server.args, {
      cwd: packageRoot,
      env: process.env,
      detached: true,
      stdio: ['ignore', logFd, logFd],
    });
    closeSync(logFd);
    if (!child.pid)
      fail('Could not start Praxis: detached process has no pid.');
    const startMarker = processStartMarker(child.pid);
    if (startMarker === null) {
      await killTree(child.pid);
      fail(
        `Could not verify the identity of the started process (pid ${child.pid}); stopped it.`,
      );
    }
    child.unref();
    child.on('error', (error) => {
      fail(`Could not start Praxis: ${error.message}`);
    });
    const state = {
      schemaVersion: 1,
      pid: child.pid,
      startMarker,
      port,
      hostname,
      mode,
      detached: true,
      nextArgs,
      startedAt: new Date().toISOString(),
    };
    writeFileSync(statePath(port), `${JSON.stringify(state, null, 2)}\n`);
    const outcome = await waitForReady(child.pid, port, logOffset);
    if (outcome !== 'ready') {
      await killTree(child.pid);
      rmSync(statePath(port), { force: true });
      const reason =
        outcome === 'dead'
          ? `Praxis on ${describeTarget(port)} (pid ${child.pid}) exited during startup.`
          : `Praxis on ${describeTarget(port)} (pid ${child.pid}) did not become ready within ${readyTimeoutMs()}ms; stopped it.`;
      console.error(reason);
      console.error(`New log output from ${logPath(port)}:`);
      for (const line of readNewLines(logPath(port), logOffset, 20))
        console.error(`  ${line}`);
      process.exit(1);
    }
    console.log(
      `Praxis ${mode} running at ${serverUrl(port, hostname)} (pid ${child.pid})`,
    );
    console.log(`Log: ${logPath(port)}`);
    return;
  }

  let managedPid = process.pid;
  const release = () => {
    const current = readState(port);
    if (current && current.pid === managedPid)
      rmSync(statePath(port), { force: true });
  };
  const child = spawn(server.command, server.args, {
    cwd: packageRoot,
    env: process.env,
    stdio: 'inherit',
  });
  child.on('error', (error) => {
    release();
    fail(`Could not start Praxis: ${error.message}`);
  });
  if (child.pid) {
    const startMarker = processStartMarker(child.pid);
    if (startMarker === null) {
      try {
        child.kill('SIGKILL');
      } catch {
        /* already gone */
      }
      release();
      fail(
        `Could not verify the identity of the started process (pid ${child.pid}); stopped it.`,
      );
    }
    managedPid = child.pid;
    writeFileSync(
      statePath(port),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          pid: child.pid,
          startMarker,
          port,
          hostname,
          mode,
          detached: false,
          nextArgs,
          startedAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
    );
    const forward = (signal) => {
      try {
        child.kill(signal);
      } catch {
        /* child already gone; its exit handler ends the wrapper */
      }
    };
    const onSigint = () => forward('SIGINT');
    const onSigterm = () => forward('SIGTERM');
    process.on('SIGINT', onSigint);
    process.on('SIGTERM', onSigterm);
    child.on('exit', (code, signal) => {
      release();
      process.removeListener('SIGINT', onSigint);
      process.removeListener('SIGTERM', onSigterm);
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      process.exit(code ?? 0);
    });
    return;
  }
  child.on('exit', (code, signal) => {
    release();
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

async function stopServer(port) {
  const state = readState(port);
  if (!state) {
    fail(`No managed Praxis server on ${describeTarget(port)}.`);
  }
  const verdict = verifyState(state);
  if (verdict === 'dead') {
    rmSync(statePath(port), { force: true });
    console.log(`Praxis on ${describeTarget(port)} was already stopped.`);
    return;
  }
  if (verdict === 'mismatch') {
    rmSync(statePath(port), { force: true });
    fail(
      `State for ${describeTarget(port)} points at an unrelated live process (pid ${state.pid}); left it alone and removed the stale state.`,
    );
  }
  if (verdict === 'unknown') {
    fail(
      `Cannot verify the process recorded for ${describeTarget(port)} (pid ${state.pid}); refusing to signal it.\n` +
        `Inspect it manually, or remove ${statePath(port)} once you are sure it is not Praxis.`,
    );
  }
  await killTree(state.pid);
  if (!isAlive(state.pid)) {
    rmSync(statePath(port), { force: true });
    console.log(
      `Stopped Praxis on ${describeTarget(port)} (pid ${state.pid}).`,
    );
    return;
  }
  fail(`Could not stop pid ${state.pid}; it is still running.`);
}

async function restartServer(parsed) {
  let states = listStates();
  if (parsed.portGiven) {
    states = states.filter((state) => state.port === parsed.port);
    if (states.length === 0) {
      fail(
        `No managed Praxis server on ${describeTarget(parsed.port)}. Run 'praxis start' first.`,
      );
    }
  }
  if (states.length === 0) {
    fail("No managed Praxis server to restart. Run 'praxis start' first.");
  }
  if (states.length > 1) {
    const ports = states.map((state) => state.port).join(', ');
    fail(
      `Several servers are running (ports ${ports}). Run 'praxis restart --port <n>'.`,
    );
  }
  const previous = states[0];
  await stopServer(previous.port);
  await startServer(
    { ...parsed, command: previous.mode, port: previous.port },
    previous,
  );
}

function printStatus(onlyPort) {
  const states = listStates().filter(
    (state) => onlyPort === undefined || state.port === onlyPort,
  );
  let running = 0;
  for (const state of states) {
    const verdict = verifyState(state);
    if (verdict === 'dead' || verdict === 'mismatch') {
      rmSync(statePath(state.port), { force: true });
      continue;
    }
    if (verdict === 'unknown') {
      console.log(
        `${describeTarget(state.port)}: process identity unverifiable (pid ${state.pid}); not signaling it.`,
      );
      continue;
    }
    running += 1;
    console.log(
      `${describeTarget(state.port)}: running (${state.mode}${state.detached ? ', detached' : ''})`,
    );
    console.log(`  URL: ${serverUrl(state.port, state.hostname)}`);
    console.log(`  PID: ${state.pid} (uptime ${uptime(state.startedAt)})`);
    console.log(`  Log: ${logPath(state.port)}`);
  }
  if (onlyPort !== undefined && running === 0) {
    console.log(`No managed Praxis server on ${describeTarget(onlyPort)}.`);
    process.exit(1);
  }
  if (onlyPort === undefined && running === 0) {
    console.log('No managed Praxis server is running.');
    process.exit(1);
  }
}

async function printLogs(parsed) {
  let port = parsed.port;
  if (!parsed.portGiven) {
    const logs = existsSync(runDir())
      ? readdirSync(runDir()).filter((name) => /^praxis-\d+\.log$/.test(name))
      : [];
    if (logs.length === 1) {
      port = Number(logs[0].slice('praxis-'.length, -'.log'.length));
    } else if (logs.length > 1) {
      const ports = logs
        .map((name) => name.slice('praxis-'.length, -'.log'.length))
        .join(', ');
      fail(
        `Several server logs exist (ports ${ports}). Run 'praxis logs --port <n>'.`,
      );
    }
  }
  const file = logPath(port);
  if (!existsSync(file)) fail(`No log file for ${describeTarget(port)}.`);
  for (const line of readLastLines(file, parsed.lines)) console.log(line);
  if (!parsed.follow) return;
  let offset = statSync(file).size;
  await new Promise(() => {
    setInterval(() => {
      if (!existsSync(file)) return;
      const size = statSync(file).size;
      if (size < offset) {
        offset = size;
        return;
      }
      if (size === offset) return;
      const chunk = readBytes(file, offset, size - offset);
      offset = size;
      process.stdout.write(chunk);
    }, 300);
  });
}

function serverUrl(port, hostname) {
  return `http://${hostname ?? 'localhost'}:${port}`;
}

function uptime(startedAt) {
  const seconds = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(startedAt)) / 1000),
  );
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

async function waitForReady(pid, port, fromOffset) {
  const deadline = Date.now() + readyTimeoutMs();
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return 'dead';
    if (
      existsSync(logPath(port)) &&
      READY_PATTERN.test(readNewOutput(logPath(port), fromOffset))
    ) {
      return isAlive(pid) ? 'ready' : 'dead';
    }
    await sleep(100);
  }
  return isAlive(pid) ? 'timeout' : 'dead';
}

function readBytes(file, start, length) {
  const fd = openSync(file, 'r');
  try {
    const size = statSync(file).size;
    const end = Math.min(size, start + length);
    if (end <= start) return '';
    const buffer = Buffer.alloc(end - start);
    let offset = 0;
    while (offset < buffer.length) {
      const read = readSync(
        fd,
        buffer,
        offset,
        buffer.length - offset,
        start + offset,
      );
      if (read === 0) break;
      offset += read;
    }
    return buffer.subarray(0, offset).toString('utf8');
  } finally {
    closeSync(fd);
  }
}

function readLastLines(file, count) {
  if (count === 0 || !existsSync(file)) return [];
  const size = statSync(file).size;
  const text = readBytes(file, Math.max(0, size - LOG_TAIL_BYTES), size);
  const lines = text.split('\n');
  if (text.endsWith('\n')) lines.pop();
  if (size > LOG_TAIL_BYTES) lines.shift();
  return lines.slice(-count);
}

function readNewOutput(file, fromOffset) {
  if (!existsSync(file)) return '';
  const size = statSync(file).size;
  if (size <= fromOffset) return '';
  return readBytes(file, fromOffset, size - fromOffset);
}

function readNewLines(file, fromOffset, count) {
  const text = readNewOutput(file, fromOffset);
  const lines = text.split('\n');
  if (text.endsWith('\n')) lines.pop();
  return lines.slice(-count);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function printHelp() {
  console.log(`Praxis

Usage:
  praxis start [options] [Next.js options]
  praxis dev [options] [Next.js options]
  praxis stop [--port <n>]
  praxis restart [options] [Next.js options]
  praxis status [--port <n>]
  praxis logs [--port <n>] [-n <lines>] [-f]

Lifecycle options:
  -d, --detach      Run in the background (start, dev, restart)
  -p, --port <n>    Server port (default ${DEFAULT_PORT})
  -H, --hostname    Hostname to advertise (passed to Next.js)
  -n, --lines <n>   Log lines to show (default 50)
  -f, --follow      Follow the log output

Only processes started by 'praxis start' (or 'dev') are managed.
Runtime state and logs live under PRAXIS_HOME/run (default ~/.praxis/run).

Examples:
  praxis start
  praxis start --port 3100
  praxis start -d --port 3100
  praxis status
  praxis logs --port 3100 -n 100
  praxis restart --port 3100
  praxis stop --port 3100
  praxis dev --port 3100`);
}
