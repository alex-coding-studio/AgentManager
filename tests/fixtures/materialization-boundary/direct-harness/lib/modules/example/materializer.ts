import type { HarnessResult } from './harness.ts';
export function materialize(result: HarnessResult) {
  return result.outcome;
}
