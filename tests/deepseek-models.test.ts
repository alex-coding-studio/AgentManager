import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deepseekEffort,
  deepseekModels,
} from '../lib/agents/deepseek/models.ts';
import { readLocalModels } from '../lib/agents/models.ts';

void test('DeepSeek model catalog is a standalone public list', () => {
  assert.deepEqual(
    deepseekModels.map((model) => model.id),
    ['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-v4-flash-vision-exp'],
  );
  for (const model of deepseekModels) {
    assert.deepEqual(model.efforts, ['none', 'low', 'high', 'max']);
  }
});

void test('DeepSeek effort maps Praxis vocabulary onto off/low/high/max', () => {
  assert.equal(deepseekEffort(''), undefined);
  assert.equal(deepseekEffort('none'), 'off');
  assert.equal(deepseekEffort('low'), 'low');
  assert.equal(deepseekEffort('high'), 'high');
  assert.equal(deepseekEffort('max'), 'max');
  assert.equal(deepseekEffort('medium'), undefined);
  assert.equal(deepseekEffort('xhigh'), undefined);
});

void test('DeepSeek model discovery returns the static catalog without a CLI', async () => {
  const catalog = await readLocalModels('deepseek');
  assert.equal(catalog.agent, 'deepseek');
  assert.deepEqual(
    catalog.models.map((model) => model.id),
    ['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-v4-flash-vision-exp'],
  );
});
