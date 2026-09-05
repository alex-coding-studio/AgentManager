import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electron from 'electron';

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(
  process.env.PRAXIS_DESKTOP_ROOT || path.join(directory, '..'),
);
const home = process.env.PRAXIS_HOME || path.join(homedir(), '.praxis');
const config = {
  root,
  node: process.execPath,
  port: Number(process.env.PRAXIS_DESKTOP_PORT || 3101),
  mode: process.env.PRAXIS_DESKTOP_MODE || 'dev',
};
await mkdir(path.join(home, 'desktop'), { recursive: true });
await writeFile(
  path.join(home, 'desktop/config.json'),
  `${JSON.stringify(config, null, 2)}\n`,
);
if (process.argv.includes('--package')) {
  const { packager } = await import('@electron/packager');
  const outputs = await packager({
    dir: directory,
    out: path.join(directory, '../dist/desktop'),
    name: 'Praxis',
    appBundleId: 'studio.alexcoding.praxis',
    icon:
      process.platform === 'darwin'
        ? path.join(directory, 'icon.icns')
        : undefined,
    executableName: 'Praxis',
    overwrite: true,
    asar: true,
    prune: true,
    ignore: [
      /\/node_modules(?:\/|$)/,
      /\/launch\.mjs$/,
      /\/package-lock\.json$/,
    ],
    darwinDarkModeSupport: true,
  });
  console.log(outputs.join('\n'));
} else {
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  const child = spawn(electron, [directory], {
    env: environment,
    stdio: 'inherit',
  });
  child.on('exit', (code) => {
    process.exitCode = code ?? 1;
  });
}
