import { installHooks } from './install-resolve-hook.mjs';
import { resolve } from './redo-hooks.mjs';

installHooks({ resolve }, new URL('./redo-hooks.mjs', import.meta.url));
