import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readAppSettings, saveAppLanguage } from '../lib/app-settings.ts';
import { chineseUi, isUiLanguage, translateUi } from '../lib/ui-language.ts';

void test('running status supports named agents and the generic Agent label', () => {
  assert.equal(
    translateUi('zh-CN', '{agent} is running', { agent: 'Codex' }),
    'Codex 运行中',
  );
  assert.equal(
    translateUi('zh-CN', '{agent} is running', { agent: 'Claude' }),
    'Claude 运行中',
  );
  assert.equal(
    translateUi('zh-CN', '{agent} is running', { agent: 'Agent' }),
    'Agent 运行中',
  );
  assert.equal(
    translateUi('en', '{agent} is running', { agent: 'Codex' }),
    'Codex is running',
  );
});

void test('language defaults to English and persists both supported choices', async () => {
  const home = await mkdtemp(
    path.join(os.tmpdir(), 'agentmanager-settings-test-'),
  );
  try {
    assert.equal((await readAppSettings(home)).language, 'en');
    await saveAppLanguage('zh-CN', home);
    assert.equal((await readAppSettings(home)).language, 'zh-CN');
    assert.deepEqual(
      JSON.parse(await readFile(path.join(home, 'settings.json'), 'utf8')),
      { schemaVersion: 1, language: 'zh-CN' },
    );
    await saveAppLanguage('en', home);
    assert.equal((await readAppSettings(home)).language, 'en');
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

void test('unsupported language never changes the saved preference', async () => {
  const home = await mkdtemp(
    path.join(os.tmpdir(), 'agentmanager-settings-test-'),
  );
  try {
    await saveAppLanguage('zh-CN', home);
    const before = await readFile(path.join(home, 'settings.json'), 'utf8');
    for (const language of ['fr', 'zh', '../../file', null, {}])
      await assert.rejects(
        () => saveAppLanguage(language, home),
        /Unsupported/,
      );
    assert.equal(
      await readFile(path.join(home, 'settings.json'), 'utf8'),
      before,
    );
    await writeFile(path.join(home, 'settings.json'), '{broken');
    assert.equal((await readAppSettings(home)).language, 'en');
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

void test('UI translation preserves variable content and falls back without translating unknown text', () => {
  assert.equal(translateUi('zh-CN', 'Settings'), '设置');
  assert.equal(translateUi('en', 'Settings'), 'Settings');
  assert.equal(
    translateUi('zh-CN', 'Open details for {title}', {
      title: 'Build My Agent Website',
    }),
    '打开详情：Build My Agent Website',
  );
  const output = '# Agent-generated output\n\nKeep this exact English content.';
  assert.equal(translateUi('zh-CN', output), output);
  assert.equal(isUiLanguage('zh-CN'), true);
  for (const [key, value] of Object.entries(chineseUi)) {
    assert.ok(value.trim(), key);
    assert.deepEqual(
      [...key.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort(),
      [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort(),
      key,
    );
  }
});
