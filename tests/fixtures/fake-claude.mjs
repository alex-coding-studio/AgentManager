import { readFileSync } from 'node:fs';
import { appendFileSync } from 'node:fs';

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const sessionId = option('--session-id') ?? option('--resume');
const resume = args.includes('--resume');
const mcp = JSON.parse(option('--mcp-config') ?? '{}').mcpServers?.praxis;
const prompt = readFileSync(0, 'utf8');
const logPath = process.env.FAKE_CLAUDE_LOG;
if (logPath)
  appendFileSync(
    logPath,
    `${JSON.stringify({ resume, sessionId, prompt, args })}\n`,
  );
const send = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
send({ type: 'system', subtype: 'init', session_id: sessionId });

async function rpc(method, params, id = 1) {
  const response = await fetch(mcp.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...mcp.headers,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
  if (!response.ok) throw new Error(`MCP ${method} failed: ${response.status}`);
  return (await response.json()).result;
}

async function callTool(name, toolArguments) {
  send({
    type: 'assistant',
    message: {
      content: [{ type: 'tool_use', name: `mcp__praxis__${name}` }],
    },
  });
  await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {} });
  const listed = await rpc('tools/list', {}, 2);
  if (!listed.tools.some((tool) => tool.name === name))
    throw new Error(`tool ${name} not listed`);
  return rpc('tools/call', { name, arguments: toolArguments }, 3);
}

const finish = (result, extra = {}) =>
  send({
    type: 'result',
    subtype: 'success',
    result,
    session_id: sessionId,
    usage: {
      input_tokens: 10,
      cache_read_input_tokens: 4,
      cache_creation_input_tokens: 0,
      output_tokens: 3,
      output_tokens_details: { thinking_tokens: 1 },
    },
    ...extra,
  });

const scenario = process.env.FAKE_CLAUDE_SCENARIO ?? 'echo';
if (resume) {
  finish(`RESUMED:${prompt.split('\n')[0]}`);
} else if (scenario === 'dispatch') {
  const first = await callTool('dispatch_worker', {
    decision: { decision: 'dispatch' },
  });
  if (first.isError) throw new Error(first.content[0].text);
  const second = await callTool('dispatch_worker', { decision: {} });
  if (!second.isError) throw new Error('overlapping dispatch was accepted');
  finish('SUSPENDED');
} else if (scenario === 'job') {
  const result = await callTool('run_job', {
    label: 'fixture',
    executable: process.execPath,
    arguments: ['-e', "setTimeout(()=>console.log('JOB_DONE'),60)"],
  });
  if (result.isError) throw new Error(result.content[0].text);
  finish('JOB_STARTED');
} else if (scenario === 'nojobs') {
  const result = await callTool('run_job', {
    label: 'x',
    executable: 'true',
    arguments: [],
  }).catch((error) => ({
    isError: true,
    content: [{ type: 'text', text: error.message }],
  }));
  finish(result.isError ? 'REJECTED' : 'STARTED');
} else if (scenario === 'nofinish') {
  const result = await callTool('dispatch_worker', { decision: {} });
  if (result.isError) throw new Error(result.content[0].text);
  setInterval(() => {}, 1000);
} else if (scenario === 'cap') {
  for (let attempt = 0; attempt < 60; attempt++) {
    const result = await callTool('dispatch_worker', { decision: {} });
    if (!result.isError) throw new Error('malformed dispatch was accepted');
  }
  finish('CAP_NOT_REACHED');
} else if (scenario === 'hang') {
  setInterval(() => {}, 1000);
} else if (scenario === 'error') {
  send({
    type: 'result',
    subtype: 'error_during_execution',
    is_error: true,
    result: 'boom',
    session_id: sessionId,
  });
} else {
  finish(`ECHO:${prompt}`);
}
