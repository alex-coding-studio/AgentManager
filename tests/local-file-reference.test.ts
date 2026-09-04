import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { POST } from '../app/api/system/local-file-reference/route.ts';

void test('HTML references carry the original location without copying source or relative dependencies', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'praxis-local-reference-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const html =
    '<link rel="stylesheet" href="./style.css"><h1>original-design-content</h1>';
  const file = path.join(root, 'design.html');
  await writeFile(file, html);
  await writeFile(path.join(root, 'style.css'), 'h1 { color: red; }');
  const response = await POST(
    new Request('http://localhost:3000/api/system/local-file-reference', {
      method: 'POST',
      headers: {
        host: 'localhost:3000',
        origin: 'http://localhost:3000',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ path: file }),
    }),
  );
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.name, 'design.html');
  assert.ok(result.content.includes(file));
  assert.ok(result.content.includes(root));
  assert.ok(!result.content.includes('original-design-content'));
  assert.equal(await readFile(file, 'utf8'), html);
  assert.equal(
    await readFile(path.join(root, 'style.css'), 'utf8'),
    'h1 { color: red; }',
  );
});
