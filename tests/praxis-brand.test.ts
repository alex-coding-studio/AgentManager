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

  const files = await textFiles(['.']);
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
      'agent_manager',
      'agentManager',
    ])
      assert.doesNotMatch(source, new RegExp(escapeRegExp(legacy)), file);
  }
});

async function textFiles(entries: string[]) {
  const files: string[] = [];
  const ignoredDirectories = new Set([
    '.git',
    '.next',
    'coverage',
    'dist',
    'node_modules',
    'out',
    'reports',
    'work',
  ]);
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
      if (child.isDirectory() && !ignoredDirectories.has(child.name))
        files.push(...(await textFiles([relative])));
      else if (/\.(?:md|mjs|json|ts|tsx)$/.test(child.name))
        files.push(relative);
    }
  }
  return files;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
