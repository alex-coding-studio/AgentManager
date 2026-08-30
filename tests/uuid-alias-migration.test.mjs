import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  readdir,
} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { migrateUuidAliases } from '../scripts/migrate-uuid-aliases.mjs';

void test('one-time migration renames folders and live references without changing UUIDs or request evidence', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'uuid-migration-test-'));
  try {
    const planning = path.join(root, 'planning');
    const uid = '10000000-0000-4000-8000-1111abcdef12';
    const save = async (file, value) => {
      const target = path.join(planning, file);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(
        target,
        typeof value === 'string' ? value : JSON.stringify(value),
      );
    };
    await save('whats-next/identities.json', {
      schemaVersion: 1,
      nextNodeNumber: 2,
      aliases: { 'CANDIDATE-0001': uid, 'NODE-0001': uid },
      formalAliases: ['NODE-0001'],
    });
    await save('whats-next/nodes/NODE-0001/node.json', {
      id: 'NODE-0001',
      uid,
      relations: { derivedFrom: [], dependsOn: [] },
      provenance: { candidateId: 'CANDIDATE-0001' },
      resources: [{ path: 'whats-next/nodes/NODE-0001/output.md' }],
    });
    const markdown = '# Product\n\nAn unchanged idea.';
    await save('whats-next/nodes/NODE-0001/output.md', markdown);
    await save('whats-next/runs/RUN-test/run.json', {
      status: 'failed',
      sourceNodeIds: ['NODE-0001'],
      agentSessionMode: 'persistent',
      input: { resourcePaths: ['whats-next/nodes/NODE-0001/output.md'] },
      result: null,
    });
    const request = '{"original":"NODE-0001"}';
    await save('whats-next/runs/RUN-test/request.json', request);
    const dry = await migrateUuidAliases(planning, path.join(root, 'backup'));
    assert.equal(dry[0].aliases['NODE-0001'], 'NODE-abcdef12');
    await migrateUuidAliases(planning, path.join(root, 'backup'), true);
    const node = JSON.parse(
      await readFile(
        path.join(planning, 'whats-next/nodes/NODE-abcdef12/node.json'),
        'utf8',
      ),
    );
    assert.equal(node.uid, uid);
    assert.equal(node.id, 'NODE-abcdef12');
    assert.equal(node.provenance.candidateId, 'CANDIDATE-abcdef12');
    assert.equal(
      node.resources[0].path,
      'whats-next/nodes/NODE-abcdef12/output.md',
    );
    assert.equal(
      await readFile(path.join(planning, node.resources[0].path), 'utf8'),
      markdown,
    );
    const run = JSON.parse(
      await readFile(
        path.join(planning, 'whats-next/runs/RUN-test/run.json'),
        'utf8',
      ),
    );
    assert.deepEqual(run.sourceNodeIds, ['NODE-abcdef12']);
    assert.equal(run.agentSessionMode, undefined);
    assert.equal(run.status, 'failed');
    assert.equal(
      await readFile(
        path.join(planning, 'whats-next/runs/RUN-test/request.json'),
        'utf8',
      ),
      request,
    );
    assert.deepEqual(await readdir(path.join(planning, 'whats-next/nodes')), [
      'NODE-abcdef12',
    ]);
    assert.equal(
      await readFile(
        path.join(root, 'backup/original/whats-next/nodes/NODE-0001/output.md'),
        'utf8',
      ),
      markdown,
    );
    const index = JSON.parse(
      await readFile(path.join(planning, 'whats-next/identities.json'), 'utf8'),
    );
    assert.equal(index.nextNodeNumber, undefined);
    assert.deepEqual(Object.keys(index.aliases).sort(), [
      'CANDIDATE-abcdef12',
      'NODE-abcdef12',
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
