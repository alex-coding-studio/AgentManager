import { installHooks } from './install-resolve-hook.mjs';
import { load, resolve } from './tsx-hooks.mjs';

installHooks({ load, resolve }, new URL('./tsx-hooks.mjs', import.meta.url));
