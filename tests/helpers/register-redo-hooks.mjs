import { installResolveHook } from './install-resolve-hook.mjs';
import { resolve } from './redo-hooks.mjs';

installResolveHook(resolve, new URL('./redo-hooks.mjs', import.meta.url));
