import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { LatestResponseDocument } from '../lib/execution-observability/types.ts';

const { LatestResponseCard } =
  await import('../components/latest-response-card.tsx');
const { AgentGraphComposerCard } =
  await import('../components/agent-graph-composer-card.tsx');
const { UiLanguageProvider } =
  await import('../components/ui-language-provider.tsx');
const { surfacePreferenceKey } =
  await import('../hooks/use-surface-preference.ts');

function document(
  overrides: Partial<LatestResponseDocument> = {},
): LatestResponseDocument {
  return {
    schemaVersion: 1,
    owner: { kind: 'module', module: 'whats-next' },
    projectId: 'project-1',
    runId: 'RUN-1',
    revision: 1,
    status: 'completed',
    title: 'Review',
    detail: 'Two directions are ready for review.',
    subject: { kind: 'layer', label: 'Product Discovery' },
    supplementaryWarnings: [],
    recovery: ['log', 'continue'],
    startedAt: '2026-09-04T00:00:00.000Z',
    updatedAt: '2026-09-04T00:01:00.000Z',
    endedAt: '2026-09-04T00:01:00.000Z',
    logRef: 'whats-next/runs/RUN-1/run.log',
    logUrlPath: '/projects/project-1/logs/whats-next/RUN-1',
    hostPid: 1,
    recentActivity: [],
    ...overrides,
  };
}

function render(element: React.ReactElement, language: 'en' | 'zh-CN' = 'en') {
  return renderToStaticMarkup(
    createElement(UiLanguageProvider, { language } as never, element),
  );
}

void test('terminal responses show status color, icon, accessible text, title, detail and a Log link', () => {
  for (const [status, dot, label] of [
    ['completed', 'bg-emerald-500', 'Completed'],
    ['warning', 'bg-amber-500', 'Warning'],
    ['fail', 'bg-destructive', 'Fail'],
  ] as const) {
    const html = render(
      createElement(LatestResponseCard, {
        document: document({ status, title: `${label} title` }),
        collapsed: false,
        onCollapsedChange: () => {},
      }),
    );
    assert.match(html, new RegExp(`data-status="${status}"`));
    assert.match(html, new RegExp(dot));
    assert.match(html, new RegExp(`>${label}<`));
    assert.match(html, new RegExp(`${label} title`));
    assert.match(html, /Two directions are ready for review\./);
    assert.match(
      html,
      /<a[^>]*href="\/projects\/project-1\/logs\/whats-next\/RUN-1"[^>]*>Log<\/a>/,
    );
    assert.match(html, /aria-expanded="true"/);
    assert.match(html, /aria-expanded="false"/);
    assert.match(html, new RegExp(`aria-label="${label}: ${label} title"`));
    assert.doesNotMatch(html, />Cancel</);
  }
});

void test('the running card shows phase, actor, elapsed time, the latest three activities, Log and Cancel', () => {
  const html = render(
    createElement(LatestResponseCard, {
      document: document({
        status: 'running',
        title: 'Running',
        detail: 'Exploring the selected direction.',
        phase: 'executing',
        actor: 'AGENT',
        endedAt: null,
        recentActivity: [1, 2, 3].map((sequence) => ({
          sequence,
          at: '2026-09-04T00:00:00.000Z',
          level: 'INFO' as const,
          actor: 'AGENT' as const,
          phase: 'EXECUTE' as const,
          event: 'agent.message',
          message: `Activity ${sequence}`,
        })),
      }),
      onCancel: () => {},
    }),
  );
  assert.match(html, /data-status="running"/);
  assert.match(html, /bg-sky-500/);
  assert.match(html, /animate-pulse/);
  assert.match(html, /Agent · Executing/);
  assert.match(html, /Activity 1/);
  assert.match(html, /Activity 3/);
  assert.match(html, />Cancel</);
  assert.match(html, /href="\/projects\/project-1\/logs\/whats-next\/RUN-1"/);
  assert.doesNotMatch(html, /aria-expanded=/);
});

void test('a Stopping run disables Cancel and says so', () => {
  const html = render(
    createElement(LatestResponseCard, {
      document: document({
        status: 'running',
        title: 'Stopping',
        phase: 'stopping',
        actor: 'HOST',
        endedAt: null,
      }),
      onCancel: () => {},
    }),
  );
  assert.match(html, /<button[^>]*disabled[^>]*>[\s\S]*?Stopping/);
});

void test('a collapsed response keeps color, icon and text while hiding the card', () => {
  const html = render(
    createElement(LatestResponseCard, {
      document: document({ status: 'warning', title: 'Canceled' }),
      collapsed: true,
      onCollapsedChange: () => {},
    }),
  );
  assert.match(html, /aria-hidden="true"[^>]*inert=""/);
  assert.match(
    html,
    /<button[^>]*data-status="warning"[^>]*aria-expanded="false"/,
  );
  assert.match(html, /<span class="sr-only">Warning<\/span>/);
  assert.match(html, />Canceled</);
});

void test('non-blocking findings are counted inside a Completed response', () => {
  const html = render(
    createElement(LatestResponseCard, {
      document: document({
        supplementaryWarnings: ['Unused import', 'Missing docs'],
      }),
    }),
  );
  assert.match(html, /data-status="completed"/);
  assert.match(html, /2 additional findings/);
  assert.match(html, /Unused import/);
});

void test('the Composer becomes a non-interactive blue point while running and keeps its preference otherwise', () => {
  const running = render(
    createElement(AgentGraphComposerCard, {
      title: 'Describe',
      running: true,
      collapsed: true,
      onCollapsedChange: () => {},
    }),
  );
  assert.match(running, /<output[^>]*aria-label="Running"/);
  assert.doesNotMatch(running, /<button/);
  assert.doesNotMatch(running, /aria-expanded=/);
  assert.match(running, /animate-ping/);
  const collapsed = render(
    createElement(AgentGraphComposerCard, {
      title: 'Describe',
      running: false,
      collapsed: true,
      onCollapsedChange: () => {},
    }),
  );
  assert.match(collapsed, /aria-expanded="false"[^>]*aria-hidden="false"/);
  assert.match(collapsed, /<aside[^>]*aria-hidden="true"[^>]*inert=""/);
  const expanded = render(
    createElement(AgentGraphComposerCard, {
      title: 'Describe',
      running: false,
      collapsed: false,
      onCollapsedChange: () => {},
    }),
  );
  assert.match(expanded, /<aside[^>]*aria-hidden="false"/);
  assert.match(
    surfacePreferenceKey('project-1', 'whats-next', 'composer'),
    /^praxis:surface:v1:project-1:whats-next:composer$/,
  );
});

void test('status labels translate while document text stays verbatim', () => {
  const html = render(
    createElement(LatestResponseCard, {
      document: document({ status: 'warning', title: 'Canceled' }),
    }),
    'zh-CN',
  );
  assert.match(html, />警告</);
  assert.match(html, /Canceled/);
});
