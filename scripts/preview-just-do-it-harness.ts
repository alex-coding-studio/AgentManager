import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildCardHarnessPrompt,
  createCardHarnessRequest,
  parseCardHarnessResult,
  type CardHarnessContext,
} from '../lib/just-do-it-harness.ts';
import {
  appendCardWorkRecord,
  readCardWorklog,
} from '../lib/just-do-it-worklog.ts';

const root = await mkdtemp(
  path.join(os.tmpdir(), 'just-do-it-harness-preview-'),
);
const cardId = '11111111-1111-4111-8111-111111111111';
await appendCardWorkRecord(root, cardId, 0, {
  kind: 'user-input',
  stage: 'planning',
  actionId: null,
  text: '先跑起一个可操作的本地网站骨架，先用演示数据。深色模式放到后续，这轮优先能操作任务卡片。',
});
await appendCardWorkRecord(root, cardId, 1, {
  kind: 'agent-note',
  stage: 'planning',
  actionId: null,
  basedOnRevision: 1,
  summary: '先走通目标输入与任务卡片，不接真实 AI，不做深色模式。',
  currentState:
    'Goal: an operable local website skeleton.\nScope: goal input, sample task cards, selection.\nExcluded: real AI and dark mode.\nStage: Planning, not finalized.\nNext: propose concrete steps for user review.\nNo execution or acceptance has occurred.',
});
const log = await readCardWorklog(root, cardId);
const context: CardHarnessContext = {
  cardId,
  contextRevision: log.revision,
  goal: '先跑起一个可操作的本地网站骨架',
  moduleInstructions:
    'Use existing project conventions. Do not call real providers or modify any project in this offline example.',
  skills: [],
  resources: [
    {
      ref: log.handoffPath!,
      description: 'Main handoff; follow its relative references on demand.',
    },
  ],
  handoffMarkdown: log.handoffMarkdown,
  plan: null,
  acceptedActionIds: [],
  currentOutput: null,
  execution: {
    running: false,
    hasOutput: false,
    effects: 'clean',
    rollbackConfirmed: false,
    consumedByCardIds: [],
  },
};
const request = createCardHarnessRequest(
  context,
  'planning',
  '请生成这一轮的执行计划。',
);
const fixture = {
  harnessRevision: request.harnessRevision,
  requestId: request.requestId,
  cardId,
  contextRevision: log.revision,
  inputFingerprint: request.inputFingerprint,
  stage: 'planning',
  overview: '先让本地页面运行，再完成目标输入与示例任务卡片的操作。',
  steps: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      title: '准备可运行的本地页面',
      input: '当前项目、相关代码及本地运行环境',
      output: '可以启动并打开网站首页',
      validation: '按启动说明打开首页，检查无阻塞错误',
    },
    {
      id: '33333333-3333-4333-8333-333333333333',
      title: '走通任务卡片交互',
      input: '已完成的网站骨架和固定示例数据',
      output: '可以输入目标、查看示例任务并选择第一步',
      validation: '实际操作输入与选择，确认状态反馈清晰',
    },
  ],
  handoffSummary:
    'Two-step Plan proposed for user review. No sign-off or execution. Dark mode remains excluded.',
};
const result = parseCardHarnessResult(
  JSON.stringify(fixture),
  request,
  log.revision,
);
await writeFile(
  path.join(root, 'request.json'),
  JSON.stringify(request, null, 2) + '\n',
  { flag: 'wx' },
);
await writeFile(
  path.join(root, 'prompt.txt'),
  buildCardHarnessPrompt(request),
  { flag: 'wx' },
);
await writeFile(
  path.join(root, 'fixture-response.json'),
  JSON.stringify(result, null, 2) + '\n',
  { flag: 'wx' },
);
console.log(
  JSON.stringify(
    {
      mode: 'offline fixture; no Agent or project writes',
      root,
      handoff: log.handoffPath,
      prompt: path.join(root, 'prompt.txt'),
      response: path.join(root, 'fixture-response.json'),
    },
    null,
    2,
  ),
);
