import { installResolveHook } from './install-resolve-hook.mjs';
import { resolve } from './resolve-alias.mjs';

installResolveHook(resolve, new URL('./resolve-alias.mjs', import.meta.url));
