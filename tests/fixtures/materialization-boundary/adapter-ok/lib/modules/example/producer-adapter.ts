import type { HarnessResult } from './harness.ts';
import type { ExampleResult } from './contract.ts';
export function toExampleResult(envelope: HarnessResult): ExampleResult {
  return {
    outcome: envelope.outcome === 'applied' ? 'model-change' : 'model-change',
  };
}
