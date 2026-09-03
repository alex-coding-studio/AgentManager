import path from 'node:path';
import type { RegisteredProject } from './project-registry.ts';

const runtime = globalThis as typeof globalThis & {
  deliveryStateMutations?: Map<string, Promise<unknown>>;
};
const mutations = (runtime.deliveryStateMutations ??= new Map<
  string,
  Promise<unknown>
>());

export async function withDeliveryState<T>(
  project: RegisteredProject,
  work: () => Promise<T>,
) {
  const key = path.resolve(project.planningPath);
  const previous = mutations.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(work);
  mutations.set(key, next);
  try {
    return (await next) as T;
  } finally {
    if (mutations.get(key) === next) mutations.delete(key);
  }
}
