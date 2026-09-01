import nodeModule from 'node:module';

export function installHooks(hooks, hooksModuleUrl) {
  if (typeof nodeModule.registerHooks === 'function') {
    nodeModule.registerHooks(hooks);
    return;
  }
  nodeModule.register(hooksModuleUrl);
}
