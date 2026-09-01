import nodeModule from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from './resolve-alias.mjs';

if (typeof nodeModule.registerHooks === 'function')
  nodeModule.registerHooks({ resolve });
else
  nodeModule.register(
    './resolve-alias.mjs',
    pathToFileURL(fileURLToPath(import.meta.url)),
  );
