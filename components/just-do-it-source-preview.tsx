'use client';

import { useMemo, useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { TaskGraphCanvas } from '@/components/task-graph-canvas';
import { MarkdownReader } from '@/components/markdown-reader';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useUiText } from '@/components/ui-language-provider';
import { graphCardLabel } from '@/lib/graph-identity';
import type { DemoGoal } from '@/lib/just-do-it-demo';
import type { TaskGraphNode } from '@/lib/task-graph';

const noAction = () => {};

export function JustDoItSourcePreview({ goal }: { goal: DemoGoal }) {
  const { t } = useUiText();
  const [focusedNodeId, setFocusedNodeId] = useState(goal.sourceId);
  const [inspecting, setInspecting] = useState(false);
  const nodes = useMemo<TaskGraphNode[]>(
    () => [
      {
        schemaVersion: 1,
        id: goal.sourceId,
        uid: `00000000-0000-4000-8000-0000${goal.sourceId.slice(5)}`,
        role: 'node',
        type: 'Implementation-Direction',
        title: goal.title,
        summary: goal.summary,
        status: 'formal',
        createdAt: '2026-08-30T00:00:00.000Z',
        updatedAt: '2026-08-30T00:00:00.000Z',
        resources: [
          {
            kind: 'output',
            path: `task-graph/nodes/${goal.sourceId}/output.md`,
          },
        ],
        dependsOn: [],
        typeTemplateRef: '',
        metadata: { demo: true },
      },
    ],
    [goal],
  );
  return (
    <div className="flex h-[calc(100dvh-4rem)] min-h-[480px] flex-col">
      <header className="shrink-0 space-y-2 border-b border-border px-5 py-4 lg:px-8">
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <FlaskConical className="size-3.5" />
          {t('Demo source canvas')} · {t(goal.source)}
        </p>
        <h1 className="text-sm font-semibold">
          {t('Located source: {id}', { id: graphCardLabel(goal.sourceId) })}
        </h1>
        <p className="text-xs text-muted-foreground">
          {t(
            'Fictional source node. This read-only canvas does not load or change your real graph.',
          )}
        </p>
      </header>
      <div className="relative min-h-0 flex-1">
        <TaskGraphCanvas
          nodes={nodes}
          previews={[]}
          focusedNodeId={focusedNodeId}
          locateRequest={null}
          readOnly
          onFocusNode={setFocusedNodeId}
          onInspectNode={() => setInspecting(true)}
          onSelectPreview={noAction}
          onDecompose={noAction}
          onCancelRun={noAction}
        />
      </div>
      <Dialog open={inspecting} onOpenChange={setInspecting}>
        <DialogContent className="max-h-[85dvh] overflow-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{graphCardLabel(goal.sourceId)}</DialogTitle>
          </DialogHeader>
          <MarkdownReader
            title="output.md"
            filePath={`demo/${goal.sourceId}/output.md`}
            markdown={`# ${goal.title}\n\n${goal.summary}\n\n## Context\n\n${goal.requirements}`}
            compact
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
