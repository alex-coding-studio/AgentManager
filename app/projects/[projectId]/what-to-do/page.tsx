import { notFound } from 'next/navigation';
import { ProjectShell } from '@/components/project-shell';
import { WhatToDoWorkspace } from '@/components/what-to-do-workspace';
import { readContextBrowser } from '@/lib/product-context';
import {
  getGitHubRepositoryUrl,
  getProject,
  listProjects,
} from '@/lib/project-registry';
import { listTaskGraphNodes } from '@/lib/task-graph';
import { listLatestWhatToDoRuns } from '@/lib/what-to-do-runs';
import { isWhatToDoFeatureNode } from '@/lib/what-to-do-sources';
import { readWhatToDoCurrentMap } from '@/lib/what-to-do-storage';

export const dynamic = 'force-dynamic';

export default async function WhatToDoPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ feature?: string | string[] }>;
}) {
  const project = await getProject((await params).projectId);
  if (!project) notFound();
  const [projects, folders, nodes, runs, currentMap] = await Promise.all([
    listProjects(),
    readContextBrowser(project),
    listTaskGraphNodes(project, 'whats-next'),
    listLatestWhatToDoRuns(project),
    readWhatToDoCurrentMap(project),
  ]);
  const requestedFeatures = (await searchParams).feature;
  const requestedUids = Array.isArray(requestedFeatures)
    ? requestedFeatures
    : requestedFeatures
      ? [requestedFeatures]
      : [];
  const availableUids = new Set(
    nodes
      .filter(isWhatToDoFeatureNode)
      .flatMap((node) =>
        node.uid && !currentMap?.sourceUids.includes(node.uid)
          ? [node.uid]
          : [],
      ),
  );
  return (
    <ProjectShell
      project={project}
      projects={projects}
      repositoryUrl={getGitHubRepositoryUrl(project)}
    >
      <WhatToDoWorkspace
        projectId={project.id}
        folders={folders}
        productDesignNodes={nodes.filter(
          (node) => node.role === 'start' || isWhatToDoFeatureNode(node),
        )}
        initialRuns={runs}
        initialMap={currentMap}
        initialSourceUids={[
          ...new Set(requestedUids.filter((uid) => availableUids.has(uid))),
        ]}
      />
    </ProjectShell>
  );
}
