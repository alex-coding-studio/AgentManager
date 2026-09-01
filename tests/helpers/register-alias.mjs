import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const projectRoot = path.resolve(import.meta.dirname, '../..');
const suffixes = ['', '.ts', '.tsx', '.mts', '.js', '/index.ts', '/index.tsx'];

function projectFile(relative) {
  const base = path.join(projectRoot, relative);
  const resolved = suffixes
    .map((suffix) => `${base}${suffix}`)
    .find((candidate) => existsSync(candidate));
  if (!resolved)
    throw new Error(`Specifier could not be resolved: ${relative}`);
  return pathToFileURL(resolved).href;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/'))
      return nextResolve(projectFile(specifier.slice(2)), context);
    if (specifier === 'next/server')
      return nextResolve(projectFile('node_modules/next/server.js'), context);
    return nextResolve(specifier, context);
  },
});
