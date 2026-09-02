import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

void test('Praxis owns the public brand and technical namespace', async () => {
  const packageFile = JSON.parse(
    await readFile(path.join(root, 'package.json'), 'utf8'),
  );
  assert.equal(packageFile.name, 'praxis');
  assert.deepEqual(packageFile.bin, { praxis: './bin/praxis.mjs' });
  assert.match(
    await readFile(path.join(root, 'README.md'), 'utf8'),
    /^# Praxis\n\n\*\*From intent to action\.\*\*/,
  );

  const files = await textFiles([
    'README.md',
    'package.json',
    'package-lock.json',
    'app',
    'bin',
    'components',
    'docs',
    'lib',
    'scripts',
    'tests',
  ]);
  for (const file of files) {
    if (file.endsWith('tests/praxis-brand.test.ts')) continue;
    const source = await readFile(path.join(root, file), 'utf8');
    for (const legacy of [
      'AgentManager',
      'Agent Manager',
      '.agent-manager',
      'AGENT_MANAGER',
      'agent-manager',
      'agentmanager',
    ])
      assert.doesNotMatch(source, new RegExp(escapeRegExp(legacy)), file);
  }
});

async function textFiles(entries: string[]) {
  const files: string[] = [];
  for (const entry of entries) {
    const absolute = path.join(root, entry);
    const children = await readdir(absolute, { withFileTypes: true }).catch(
      () => null,
    );
    if (!children) {
      files.push(entry);
      continue;
    }
    for (const child of children) {
      const relative = path.join(entry, child.name);
      if (child.isDirectory()) files.push(...(await textFiles([relative])));
      else if (/\.(?:md|mjs|json|ts|tsx)$/.test(child.name))
        files.push(relative);
    }
  }
  return files;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
