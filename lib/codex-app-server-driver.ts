import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import readline from 'node:readline';
import type {
  AgentRuntimeCapabilities,
  AgentRuntimeEvent,
  AgentRuntimeThread,
  AgentRuntimeThreadInput,
  AgentRuntimeTurn,
  AgentRuntimeTurnInput,
  AgentRuntimeTurnResult,
  AgentSessionDriver,
} from './agent-runtime-driver.ts';
import { HostJobBroker, type HostJobRequest } from './host-job-broker.ts';

export type CodexAppServerDriverOptions = {
  command?: string;
  arguments?: string[];
  environment?: NodeJS.ProcessEnv;
  brokerFactory: (input: AgentRuntimeThreadInput) => HostJobBroker;
};
type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};
type RpcMessage = {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: unknown;
};
type TurnState = {
  threadId: string;
  turnId: string;
  finalOutput: string;
  usage: AgentRuntimeTurnResult['usage'];
  onEvent?: (event: AgentRuntimeEvent) => void;
  resolve: (result: AgentRuntimeTurnResult) => void;
  reject: (error: Error) => void;
};

export class CodexAppServerDriver implements AgentSessionDriver {
  readonly provider = 'codex' as const;
  readonly capabilities: AgentRuntimeCapabilities = {
    persistentThreads: true,
    pushToolResults: true,
    turnResume: true,
    turnInterrupt: true,
  };
  private child: ChildProcessWithoutNullStreams;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private threads = new Map<string, AgentRuntimeThread>();
  private brokers = new Map<string, HostJobBroker>();
  private turns = new Map<string, TurnState>();
  private ready: Promise<void>;
  private brokerFactory: CodexAppServerDriverOptions['brokerFactory'];

  constructor(options: CodexAppServerDriverOptions) {
    this.brokerFactory = options.brokerFactory;
    this.child = spawn(
      options.command ?? 'codex',
      options.arguments ?? ['app-server', '--stdio'],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: options.environment ?? agentProcessEnvironment(),
      },
    );
    readline
      .createInterface({ input: this.child.stdout })
      .on('line', (line) => this.receive(line));
    this.child.stderr.on('data', () => {});
    this.child.on('error', (error) => this.failAll(error));
    this.child.on('exit', () =>
      this.failAll(new Error('Codex App Server exited.')),
    );
    this.ready = this.initialize();
  }

  async startThread(input: AgentRuntimeThreadInput) {
    await this.ready;
    const response = (await this.request('thread/start', {
      cwd: input.workingDirectory,
      model: input.profile.model || null,
      sandbox:
        input.access === 'full-access' ? 'danger-full-access' : input.access,
      approvalPolicy: 'never',
      multiAgentMode: 'explicitRequestOnly',
      developerInstructions:
        'Complete only the assigned worker task. Do not create or delegate to other agents. Use the Host run_job tool for long-running commands and wait for its pushed result.',
      ephemeral: false,
      dynamicTools: [
        {
          type: 'function',
          name: 'run_job',
          description:
            'Run one long command in the current Card workspace. The Host returns only after process completion; do not poll it.',
          inputSchema: {
            type: 'object',
            additionalProperties: false,
            required: ['label', 'executable', 'arguments'],
            properties: {
              label: { type: 'string' },
              executable: { type: 'string' },
              arguments: { type: 'array', items: { type: 'string' } },
              workingDirectory: { type: 'string' },
              timeoutMs: { type: 'integer', minimum: 1 },
            },
          },
        },
      ],
    })) as { thread: { id: string } };
    const thread = {
      provider: this.provider,
      threadId: response.thread.id as string,
      profile: input.profile,
      workingDirectory: input.workingDirectory,
      access: input.access,
    };
    this.threads.set(thread.threadId, thread);
    this.brokers.set(thread.threadId, this.brokerFactory(input));
    return thread;
  }

  async resumeThread(thread: AgentRuntimeThread) {
    await this.ready;
    await this.request('thread/resume', { threadId: thread.threadId });
    this.threads.set(thread.threadId, thread);
    if (!this.brokers.has(thread.threadId))
      this.brokers.set(
        thread.threadId,
        this.brokerFactory({
          profile: thread.profile,
          workingDirectory: thread.workingDirectory,
          access: thread.access,
        }),
      );
    return thread;
  }

  startTurn(
    thread: AgentRuntimeThread,
    input: AgentRuntimeTurnInput,
  ): AgentRuntimeTurn {
    let turnId = '';
    const completion = (async () => {
      await this.ready;
      const started = (await this.request('turn/start', {
        threadId: thread.threadId,
        input: [{ type: 'text', text: input.prompt }],
        model: thread.profile.model || null,
        effort: thread.profile.effort || null,
      })) as { turn: { id: string } };
      turnId = started.turn.id;
      return await new Promise<AgentRuntimeTurnResult>((resolve, reject) => {
        this.turns.set(turnId, {
          threadId: thread.threadId,
          turnId,
          finalOutput: '',
          usage: null,
          onEvent: input.onEvent,
          resolve,
          reject,
        });
      });
    })();
    return {
      completion,
      interrupt: () => {
        if (turnId)
          void this.request('turn/interrupt', {
            threadId: thread.threadId,
            turnId,
          }).catch(() => undefined);
        this.brokers.get(thread.threadId)?.cancelAll();
      },
    };
  }

  async close() {
    for (const broker of this.brokers.values()) broker.cancelAll();
    this.child.kill('SIGTERM');
  }

  private async initialize() {
    await this.request('initialize', {
      clientInfo: {
        name: 'agent-manager',
        title: 'AgentManager',
        version: '0.1.0',
      },
      capabilities: { experimentalApi: true },
    });
    this.send({ method: 'initialized' });
  }

  private request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    this.send({ id, method, params });
    return new Promise((resolve, reject) =>
      this.pending.set(id, { resolve, reject }),
    );
  }

  private send(value: unknown) {
    this.child.stdin.write(`${JSON.stringify(value)}\n`);
  }

  private receive(line: string) {
    let message: RpcMessage;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (typeof message.id === 'number' && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id)!;
      this.pending.delete(message.id);
      if (message.error)
        pending.reject(new Error(JSON.stringify(message.error)));
      else pending.resolve(message.result);
      return;
    }
    if (message.method === 'item/tool/call') {
      void this.handleToolCall(message);
      return;
    }
    const nestedTurn = message.params?.turn as
      | Record<string, unknown>
      | undefined;
    const turn = this.turns.get(
      stringValue(message.params?.turnId ?? nestedTurn?.id),
    );
    if (!turn) return;
    const now = new Date().toISOString();
    if (
      message.method === 'item/started' ||
      message.method === 'item/completed'
    ) {
      const item = message.params?.item as Record<string, unknown> | undefined;
      if (item?.type === 'agentMessage') {
        turn.finalOutput = stringValue(item.text ?? item.message);
        const summary = turn.finalOutput.trim().startsWith('{')
          ? 'Agent report received.'
          : turn.finalOutput.slice(0, 600);
        if (summary)
          turn.onEvent?.({
            type: 'activity',
            threadId: turn.threadId,
            turnId: turn.turnId,
            summary,
            at: now,
          });
      }
      if (item?.type === 'fileChange')
        turn.onEvent?.({
          type: 'activity',
          threadId: turn.threadId,
          turnId: turn.turnId,
          summary: 'Workspace files changed.',
          at: now,
        });
      if (item?.type === 'commandExecution') {
        const phase =
          message.method === 'item/started' ? 'Running' : 'Finished';
        turn.onEvent?.({
          type: 'activity',
          threadId: turn.threadId,
          turnId: turn.turnId,
          summary: `${phase}: ${stringValue(item.command).slice(0, 560)}`,
          at: now,
        });
      }
    }
    if (message.method === 'thread/tokenUsage/updated')
      turn.usage = normalizeUsage(
        (message.params?.tokenUsage as Record<string, unknown> | undefined)
          ?.total ??
          message.params?.tokenUsage ??
          message.params?.usage,
      );
    if (message.method === 'turn/completed') {
      this.turns.delete(turn.turnId);
      turn.onEvent?.({
        type: 'turn-completed',
        threadId: turn.threadId,
        turnId: turn.turnId,
        at: now,
      });
      turn.resolve({
        threadId: turn.threadId,
        turnId: turn.turnId,
        finalOutput: turn.finalOutput,
        usage: turn.usage,
      });
    }
  }

  private async handleToolCall(message: RpcMessage) {
    const params = message.params ?? {};
    if (params.tool !== 'run_job') {
      this.send({
        id: message.id,
        result: {
          success: false,
          contentItems: [{ type: 'inputText', text: 'Unsupported Host tool.' }],
        },
      });
      return;
    }
    const threadId = stringValue(params.threadId);
    const thread = this.threads.get(threadId);
    const broker = this.brokers.get(threadId);
    if (!thread || !broker) {
      this.send({
        id: message.id,
        result: {
          success: false,
          contentItems: [
            { type: 'inputText', text: 'Unknown App Server thread.' },
          ],
        },
      });
      return;
    }
    const arguments_ = params.arguments as Partial<HostJobRequest> & {
      workingDirectory?: string;
    };
    const workingDirectory = pathWithin(
      thread.workingDirectory,
      arguments_.workingDirectory ?? '.',
    );
    try {
      const job = await broker.run({
        label: String(arguments_.label ?? ''),
        executable: String(arguments_.executable ?? ''),
        arguments: Array.isArray(arguments_.arguments)
          ? arguments_.arguments.map(String)
          : [],
        workingDirectory,
        timeoutMs:
          typeof arguments_.timeoutMs === 'number'
            ? arguments_.timeoutMs
            : undefined,
      });
      const result = await job.completion;
      this.send({
        id: message.id,
        result: {
          success: result.status === 'completed',
          contentItems: [{ type: 'inputText', text: JSON.stringify(result) }],
        },
      });
    } catch (error) {
      this.send({
        id: message.id,
        result: {
          success: false,
          contentItems: [
            {
              type: 'inputText',
              text: error instanceof Error ? error.message : 'Host job failed.',
            },
          ],
        },
      });
    }
  }

  private failAll(error: Error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    for (const turn of this.turns.values()) turn.reject(error);
    this.turns.clear();
  }
}

function pathWithin(root: string, relative: string) {
  if (relative.startsWith('/') || relative.split('/').includes('..'))
    throw new Error(
      'Job working directory must stay inside the Card workspace.',
    );
  return `${root}/${relative}`;
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function normalizeUsage(value: unknown) {
  if (!value) return null;
  const usage = value as Record<string, unknown>;
  return {
    inputTokens: Number(usage.inputTokens ?? usage.input_tokens ?? 0),
    cachedInputTokens: Number(
      usage.cachedInputTokens ?? usage.cached_input_tokens ?? 0,
    ),
    cacheWriteInputTokens: Number(
      usage.cacheWriteInputTokens ?? usage.cache_write_input_tokens ?? 0,
    ),
    outputTokens: Number(usage.outputTokens ?? usage.output_tokens ?? 0),
    reasoningOutputTokens: Number(
      usage.reasoningOutputTokens ?? usage.reasoning_output_tokens ?? 0,
    ),
  };
}

function agentProcessEnvironment() {
  const environment = { ...process.env };
  delete environment.OPENAI_API_KEY;
  delete environment.ANTHROPIC_API_KEY;
  return environment;
}
