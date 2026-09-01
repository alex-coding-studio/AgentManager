import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFile } from 'node:fs/promises';
import { UiLanguageProvider } from '../components/ui-language-provider.tsx';
import {
  CANVAS_NODE_CARD_MIN_HEIGHT,
  canvasNodeCardMinHeight,
} from '../lib/canvas-node-card-metrics.ts';
import { TASK_GRAPH_NODE_MIN_HEIGHT } from '../lib/graph-card-metrics.ts';

const { CanvasNodeCardFrame } =
  await import('../components/canvas-node-card-frame.tsx');

type FrameProps = Parameters<typeof CanvasNodeCardFrame>[0];

function render(props: FrameProps) {
  return renderToStaticMarkup(createElement(CanvasNodeCardFrame, props));
}

function control(
  label: string,
  extra: Record<string, unknown> = {},
): ReactNode {
  return createElement('button', {
    type: 'button',
    'aria-label': label,
    ...extra,
  });
}

void test('standard density keeps the Task Graph layout height', () => {
  assert.equal(
    canvasNodeCardMinHeight('standard'),
    TASK_GRAPH_NODE_MIN_HEIGHT,
    'the layout adapter and the Frame must agree on standard height',
  );
});

void test('compact density is shorter than standard and stays in the agreed range', () => {
  const compact = canvasNodeCardMinHeight('compact');
  assert.ok(compact < CANVAS_NODE_CARD_MIN_HEIGHT.standard);
  assert.ok(compact >= 96 && compact <= 112, `compact height was ${compact}`);
});

void test('only standard and compact densities exist', () => {
  assert.deepEqual(Object.keys(CANVAS_NODE_CARD_MIN_HEIGHT).sort(), [
    'compact',
    'standard',
  ]);
});

void test('both densities render one card of the shared width', () => {
  for (const density of ['standard', 'compact'] as const) {
    const html = render({ title: 'Item', density });
    assert.match(html, /data-canvas-node-card/);
    assert.match(html, new RegExp(`data-density="${density}"`));
    assert.match(html, /class="[^"]*\bw-72\b/);
    assert.match(
      html,
      new RegExp(`min-height:${canvasNodeCardMinHeight(density)}px`),
    );
  }
});

void test('a compact card with short content reserves no standard height', () => {
  const compact = render({
    title: 'Item',
    summary: 'A physical thing the user records.',
    density: 'compact',
  });
  assert.match(compact, /min-height:104px/);
  assert.doesNotMatch(compact, /min-height:160px/);
});

void test('selection, focus, details, status and footer are independent', () => {
  const base: FrameProps = { title: 'Item' };
  const selectionOnly = render({
    ...base,
    selected: true,
    selectionControl: control('Select Item'),
  });
  assert.match(selectionOnly, /Select Item/);
  assert.match(selectionOnly, /ring-2 ring-foreground\/35/);
  assert.doesNotMatch(selectionOnly, /ring-3 ring-ring\/20/);
  assert.doesNotMatch(selectionOnly, /Open details/);

  const focusOnly = render({ ...base, focused: true });
  assert.match(focusOnly, /ring-3 ring-ring\/20/);
  assert.doesNotMatch(focusOnly, /ring-2 ring-foreground\/35/);

  const detailsOnly = render({
    ...base,
    detailsControl: control('Open details for Item'),
  });
  assert.match(detailsOnly, /Open details for Item/);
  assert.doesNotMatch(detailsOnly, /aria-pressed/);

  const statusOnly = render({ ...base, status: 'Waiting' });
  assert.match(statusOnly, /Waiting/);

  const footerOnly = render({ ...base, footer: 'In 1 · Out 1' });
  assert.match(footerOnly, /In 1 · Out 1/);

  const bare = render(base);
  for (const absent of ['Select Item', 'Open details', 'Waiting', 'In 1'])
    assert.ok(!bare.includes(absent), `${absent} should not render`);
});

void test('a selected card keeps its selection ring while also focused', () => {
  const html = render({ title: 'Item', focused: true, selected: true });
  const classes = /class="([^"]*)"/.exec(html)?.[1] ?? '';
  const rings = classes.split(' ').filter((name) => name.startsWith('ring'));
  assert.deepEqual(rings, ['ring-2', 'ring-foreground/35']);
});

void test('a card without a title area still renders every provided slot once', () => {
  const html = render({
    title: 'Item',
    selectionControl: control('Select Item'),
    kindLabel: 'Entity',
    headerActions: control('Show direct dependencies for Item'),
    detailsControl: control('Open details for Item'),
    summary: 'One line of meaning.',
    footer: 'Rev 2',
    edgeAction: control('Decompose from Item'),
  });
  for (const fragment of [
    'aria-label="Select Item"',
    'Entity',
    'aria-label="Show direct dependencies for Item"',
    'aria-label="Open details for Item"',
    'One line of meaning.',
    'Rev 2',
    'aria-label="Decompose from Item"',
  ])
    assert.equal(
      html.split(fragment).length - 1,
      1,
      `${fragment} should appear exactly once`,
    );
});

void test('accessible names come from the slotted controls, not the Frame', () => {
  const html = render({
    title: 'Item',
    selectionControl: control('Select Item', { 'aria-pressed': 'false' }),
    detailsControl: control('Open details for Item'),
  });
  assert.match(html, /aria-label="Select Item"/);
  assert.match(html, /aria-pressed="false"/);
  assert.match(html, /aria-label="Open details for Item"/);
  assert.doesNotMatch(html, /<div[^>]*aria-label/);
});

void test('a busy card is announced and uses the accent border', () => {
  const busy = render({ title: 'Item', busy: true, accentColor: '#ff0000' });
  assert.match(busy, /aria-busy="true"/);
  assert.match(busy, /border-color:#ff0000/);
  assert.match(busy, /border-width:2px/);

  const idle = render({ title: 'Item', accentColor: '#ff0000' });
  assert.doesNotMatch(idle, /aria-busy="true"/);
  assert.match(idle, /border-top-color:var\(--foreground\)/);
});

void test('a provisional card is visually distinct and keeps its accent', () => {
  const html = render({
    title: 'Item',
    appearance: 'provisional',
    accentColor: '#00aa00',
  });
  assert.match(html, /border-dashed/);
  assert.match(html, /bg-secondary\/35/);
  assert.match(html, /border-top-color:#00aa00/);
});

void test('a dimmed card reads as de-emphasised without losing its content', () => {
  const html = render({ title: 'Item', dimmed: true, summary: 'Still here.' });
  assert.match(html, /opacity-40/);
  assert.match(html, /Still here./);
});

void test('an explicitly empty summary keeps its slot so height does not jump', () => {
  const empty = render({ title: 'Item', summary: '' });
  const absent = render({ title: 'Item' });
  assert.match(empty, /class="mt-1\.5"/);
  assert.doesNotMatch(absent, /class="mt-1\.5"/);
});

void test('the shared Frame requires no Task Graph data', async () => {
  const source = await readFile(
    new URL('../components/canvas-node-card-frame.tsx', import.meta.url),
    'utf8',
  );
  for (const forbidden of [
    'task-graph',
    'TaskGraph',
    'graph-identity',
    'graph-card-metrics',
    'inputCount',
    'outputCount',
    'relationshipCount',
    'revision',
    'candidate',
    'formal',
  ])
    assert.ok(
      !source.includes(forbidden),
      `the Frame must not reference ${forbidden}`,
    );

  const props = render({ title: 'Item', density: 'compact' });
  assert.match(props, /Item/);
});

void test('GraphNodeCard adapts the shared Frame instead of duplicating the shell', async () => {
  const source = await readFile(
    new URL('../components/graph-node-card.tsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /import \{ CanvasNodeCardFrame \}/);
  assert.match(source, /<CanvasNodeCardFrame/);
  for (const shellFragment of [
    'rounded-2xl border border-t-[3px]',
    'shadow-[0_10px_30px_rgb(15_23_42/6%)]',
    'flex w-72 flex-col',
  ])
    assert.ok(
      !source.includes(shellFragment),
      `the adapter must not re-declare ${shellFragment}`,
    );
});

const CARD_SCENARIOS: Array<[string, Record<string, unknown>, boolean]> = [
  ['formal selectable unselected', { selectionEnabled: true }, false],
  [
    'formal selectable selected',
    { selectionEnabled: true, selectedForRun: true },
    false,
  ],
  ['formal focused', {}, true],
  [
    'formal with dependencies',
    { relationshipCount: 3, dependenciesFocused: true },
    false,
  ],
  ['formal with revision footer', { revision: 4 }, false],
  ['formal read-only', { readOnly: true }, false],
  ['preview candidate', { kind: 'preview', transientKind: 'candidate' }, false],
  [
    'preview run',
    {
      kind: 'preview',
      transientKind: 'run',
      runId: 'RUN-1',
      agentLabel: 'Codex',
    },
    false,
  ],
  [
    'preview run without a summary',
    {
      kind: 'preview',
      transientKind: 'run',
      description: undefined,
    },
    false,
  ],
  ['preview plain', { kind: 'preview' }, false],
];

const CARD_BASE = {
  displayId: 'NODE-abcdef12',
  kind: 'formal' as const,
  title: 'A representative product direction',
  type: 'direction',
  inputCount: 2,
  outputCount: 1,
  color: '#4f46e5',
  description: 'A bounded summary of what this card means.',
  relationshipCount: 0,
  onFocusDependencies: () => {},
  onDecompose: () => {},
  onToggleSelection: () => {},
  onInspect: () => {},
  onCancelRun: () => {},
};

void test('every Task Graph card scenario still renders its full shell through the Frame', async () => {
  const { GraphNodeCard } = await import('../components/graph-node-card.tsx');
  for (const [label, overrides, focused] of CARD_SCENARIOS) {
    const data = { ...CARD_BASE, ...overrides };
    const html = renderToStaticMarkup(
      createElement(
        UiLanguageProvider as never,
        { initialLanguage: 'en' } as never,
        createElement(
          GraphNodeCard as never,
          {
            data,
            selected: focused,
          } as never,
        ),
      ),
    );
    assert.match(html, /data-canvas-node-card/, label);
    assert.match(html, /data-density="standard"/, label);
    assert.match(html, /min-height:160px/, label);
    assert.match(html, /A representative product direction/, label);
    assert.match(html, /In 2 · Out 1|Rev 4 · In 2 · Out 1/, label);
  }
});

void test('a running card without a summary keeps the summary slot so height is stable', async () => {
  const { GraphNodeCard } = await import('../components/graph-node-card.tsx');
  const render = (description?: string) =>
    renderToStaticMarkup(
      createElement(
        UiLanguageProvider as never,
        { initialLanguage: 'en' } as never,
        createElement(
          GraphNodeCard as never,
          {
            data: {
              ...CARD_BASE,
              description,
              kind: 'preview',
              transientKind: 'run',
            },
          } as never,
        ),
      ),
    );
  assert.match(render(undefined), /class="mt-1\.5"><p class="line-clamp-3/);
  assert.match(render('Present.'), /class="mt-1\.5"><p class="line-clamp-3/);
});
