import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  readAppSettings,
  saveAppLanguage,
  updateAppSettings,
  isSettingsPatch,
} from '../lib/app-settings.ts';
import { resolveUiTheme, THEME_BOOTSTRAP } from '../lib/ui-theme.ts';
import { runInNewContext } from 'node:vm';
import { chineseUi, isUiLanguage, translateUi } from '../lib/ui-language.ts';

void test('module names translate without renaming dependency terminology', () => {
  for (const [english, chinese] of [
    ['Product Discovery & Design', '产品探索与设计'],
    ['Scope Decomposition', '范围分解'],
    ['Domain Modeling', '领域建模'],
    ['Delivery Planning', '交付规划'],
    ['Implementation', '开发执行'],
    ['Dependencies', '依赖关系'],
  ]) {
    assert.equal(translateUi('en', english), english);
    assert.equal(translateUi('zh-CN', english), chinese);
  }
  assert.equal(translateUi('zh-CN', 'Discovery'), '探索');
});

void test('built-in Agent Graph profiles and effort levels are localized', () => {
  for (const [english, chinese] of [
    ['MVP Exploration', 'MVP 探索'],
    ['Feature Synthesis', '功能提炼'],
    ['Product Design Completion', '产品设计补全'],
    ['Understand the structure', '理清结构'],
    ['Product modules', '产品模块'],
    ['Implementation approach', '实现方案'],
    ['Delivery breakdown', '交付拆分'],
    ['Unspecified', '未指定'],
    ['Diverge', '发散'],
    ['Converge', '收敛'],
    ['xhigh', '极高'],
    ['max', '最大'],
  ]) {
    assert.equal(translateUi('en', english), english);
    assert.equal(translateUi('zh-CN', english), chinese);
  }
});

void test('Domain Modeling localizes its complete static workspace surface', () => {
  for (const [english, chinese] of [
    ['Describe the model change', '描述模型修改'],
    ['Domain Model instructions', '领域模型指令'],
    ['Primary fields', '主要字段'],
    ['Constraints', '约束'],
    ['Undo last change', '撤销上次修改'],
    ['The current Domain Model was updated.', '当前领域模型已更新。'],
  ])
    assert.equal(translateUi('zh-CN', english), chinese);
  assert.equal(
    translateUi('zh-CN', '{count} fields', { count: 3 }),
    '3 个字段',
  );
});

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
  const home = await mkdtemp(path.join(os.tmpdir(), 'praxis-settings-test-'));
  try {
    assert.equal((await readAppSettings(home)).language, 'en');
    await saveAppLanguage('zh-CN', home);
    assert.equal((await readAppSettings(home)).language, 'zh-CN');
    assert.deepEqual(
      JSON.parse(await readFile(path.join(home, 'settings.json'), 'utf8')),
      { schemaVersion: 1, language: 'zh-CN', theme: 'system' },
    );
    await saveAppLanguage('en', home);
    assert.equal((await readAppSettings(home)).language, 'en');
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

void test('appearance persists without replacing language, including concurrent partial saves', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'praxis-theme-test-'));
  try {
    await writeFile(
      path.join(home, 'settings.json'),
      JSON.stringify({ schemaVersion: 1, language: 'zh-CN' }),
    );
    assert.equal((await readAppSettings(home)).theme, 'system');
    await updateAppSettings({ theme: 'dark' }, home);
    assert.deepEqual(await readAppSettings(home), {
      schemaVersion: 1,
      language: 'zh-CN',
      theme: 'dark',
    });
    await Promise.all([
      saveAppLanguage('en', home),
      updateAppSettings({ theme: 'light' }, home),
    ]);
    assert.deepEqual(await readAppSettings(home), {
      schemaVersion: 1,
      language: 'en',
      theme: 'light',
    });
    for (const value of [
      { theme: 'invalid' },
      { theme: undefined },
      { language: 'zh-CN', extra: true },
      {},
    ]) {
      assert.equal(isSettingsPatch(value), false);
      await assert.rejects(
        () => updateAppSettings(value as never, home),
        /Unsupported/,
      );
    }
    assert.equal((await readAppSettings(home)).theme, 'light');
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

void test('explicit appearance overrides the system and bootstrap agrees before hydration', () => {
  for (const theme of ['light', 'dark', 'system'] as const)
    for (const systemDark of [true, false]) {
      let actual: unknown;
      runInNewContext(THEME_BOOTSTRAP, {
        document: {
          documentElement: {
            dataset: { theme },
            classList: {
              toggle: (_name: string, dark: boolean) => {
                actual = dark;
              },
            },
          },
        },
        window: { matchMedia: () => ({ matches: systemDark }) },
      });
      assert.equal(actual, resolveUiTheme(theme, systemDark) === 'dark');
    }
});

void test('unsupported language never changes the saved preference', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'praxis-settings-test-'));
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
