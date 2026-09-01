import nodeModule from 'node:module';

export function installResolveHook(resolve, hooksModuleUrl) {
  if (typeof nodeModule.registerHooks === 'function') {
    nodeModule.registerHooks({ resolve });
    return;
  }
  nodeModule.register(hooksModuleUrl);
}
