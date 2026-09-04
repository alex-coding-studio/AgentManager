import assert from 'node:assert/strict';
import test from 'node:test';
import {
  completedContractUids,
  contractDeliveryStates,
} from '../lib/modules/delivery-planning/completion.ts';
import type { PlanningCard } from '../lib/modules/implementation/planning-service.ts';
import type { PlanningSource } from '../lib/modules/implementation/planning-sources.ts';

const source: PlanningSource = {
  module: 'what-to-do',
  id: 'NODE-test',
  uid: 'contract',
  title: 'Contract',
  summary: '',
  dependsOn: [],
  outputPaths: [],
  version: 'current',
};
function card(accepted: string[], version = 'current') {
  return {
    source: { ...source, version },
    plan: { status: 'finalized' },
    actions: [{ id: 'one' }, { id: 'two' }],
    execution: { acceptedActionIds: accepted },
  } as unknown as PlanningCard;
}
void test('completion requires every current Action acceptance and disappears after rollback', () => {
  assert.deepEqual(completedContractUids([card(['one'])], [source]), []);
  assert.deepEqual(completedContractUids([card(['one', 'two'])], [source]), [
    'contract',
  ]);
  assert.deepEqual(completedContractUids([card(['one'])], [source]), []);
});
void test('acceptance of an old contract revision and empty plans do not complete the current contract', () => {
  assert.deepEqual(
    completedContractUids([card(['one', 'two'], 'old')], [source]),
    [],
  );
  const empty = card([]);
  empty.actions = [];
  assert.deepEqual(completedContractUids([empty], [source]), []);
});

void test('imported tasks show delivery in progress and acceptance changes the state', () => {
  assert.deepEqual(contractDeliveryStates([], [source]), {});
  assert.deepEqual(contractDeliveryStates([card([])], [source]), {
    contract: 'in-progress',
  });
  assert.deepEqual(contractDeliveryStates([card(['one', 'two'])], [source]), {
    contract: 'completed',
  });
  assert.deepEqual(contractDeliveryStates([card(['one'])], [source]), {
    contract: 'in-progress',
  });
  assert.deepEqual(
    contractDeliveryStates([card(['one', 'two'], 'old')], [source]),
    {},
  );
});
