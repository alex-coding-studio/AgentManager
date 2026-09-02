import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  ensureCardWorkspace,
  cardGitWritePaths,
} from '../lib/just-do-it-worktree.ts';
import { buildCodexArguments } from '../lib/local-agent-transport.ts';
import type { RegisteredProject } from '../lib/project-registry.ts';
import type { PlanningCard } from '../lib/just-do-it-planning-service.ts';

if (process.platform !== 'darwin')
  throw new Error('This sandbox smoke requires macOS.');
const exec = promisify(execFile);
const parent = await mkdtemp(
  path.join(os.homedir(), '.praxis-sandbox-fixture-'),
);
try {
  const root = path.join(parent, 'project');
  const planning = path.join(root, '.praxis');
  const id = randomUUID();
  await mkdir(path.join(planning, 'implementation/cards', id), {
    recursive: true,
  });
  const project = {
    rootPath: root,
    planningPath: planning,
    codePath: null,
    kind: 'standalone',
  } as RegisteredProject;
  const workspace = await ensureCardWorkspace(
    project,
    { id } as PlanningCard,
    true,
  );
  const paths = await cardGitWritePaths(workspace);
  const args = buildCodexArguments({
    workingDirectory: workspace.path,
    prompt: '',
    access: 'workspace-write',
    protectedPath: planning,
    gitWritePaths: paths,
    primaryRepositoryPath: workspace.repository,
  });
  const config = args.find((arg) =>
    arg.startsWith('permissions.agent_manager_action='),
  )!;
  const forbidden = [
    path.join(workspace.gitDirectory, 'HEAD'),
    path.join(workspace.gitDirectory, 'index'),
    path.join(workspace.gitDirectory, 'refs/heads/main'),
    path.join(root, 'primary.txt'),
    path.join(planning, 'forbidden.txt'),
  ];
  const script = `const fs=require('node:fs'),cp=require('node:child_process');fs.writeFileSync('app.txt','fixture');for(const target of ${JSON.stringify(forbidden)}){let blocked=false;try{fs.writeFileSync(target,fs.existsSync(target)?fs.readFileSync(target):'forbidden')}catch(e){blocked=true}if(!blocked)throw Error('Unexpected write allowed: '+target)}cp.execFileSync('git',['add','app.txt']);cp.execFileSync('git',['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','isolated']);console.log('PASS: Card commit succeeds; primary HEAD/index/main/source and planning writes denied.');`;
  const result = await exec(
    'codex',
    [
      'sandbox',
      '-P',
      'agent_manager_action',
      '-c',
      config,
      '-C',
      workspace.path,
      '--',
      process.execPath,
      '-e',
      script,
    ],
    { timeout: 20000, maxBuffer: 20000 },
  );
  process.stdout.write(result.stdout);
} catch (error) {
  process.stderr.write((error as { stderr?: string }).stderr ?? String(error));
  process.exitCode = 1;
} finally {
  await rm(parent, { recursive: true, force: true });
}
