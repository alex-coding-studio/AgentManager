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

export const dynamic = 'force-dynamic';

export default async function WhatToDoPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const project = await getProject((await params).projectId);
  if (!project) notFound();
  const [projects, folders, nodes, runs] = await Promise.all([
    listProjects(),
    readContextBrowser(project),
    listTaskGraphNodes(project, 'whats-next'),
    listLatestWhatToDoRuns(project),
  ]);
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
      />
    </ProjectShell>
  );
}
