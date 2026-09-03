import { notFound } from 'next/navigation';
import { ProjectShell } from '@/components/project-shell';
import { TaskDecompositionWorkspace } from '@/components/task-decomposition-workspace';
import { readContextBrowser } from '@/lib/modules/product-context/catalog';
import {
  getGitHubRepositoryUrl,
  getProject,
  listProjects,
} from '@/lib/project-registry';
import { listTaskGraphNodes } from '@/lib/graph/task/model';
import { findDemoSource } from '@/lib/modules/implementation/demo';
import { JustDoItSourcePreview } from '@/components/just-do-it-source-preview';
import {
  createTaskGraphPreview,
  createTaskGraphRefiningPreview,
} from '@/lib/graph/task/preview';
import { listLatestTaskDecompositionRuns } from '@/lib/modules/scope-decomposition/runs';

export const dynamic = 'force-dynamic';

export default async function TaskDecompositionPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ preview?: string; node?: string }>;
}) {
  const { projectId } = await params;
  const { preview, node } = await searchParams;
  const project = await getProject(projectId);
  if (!project) notFound();
  if (preview === 'implementation-source') {
    const goal = findDemoSource('Break It Down', node ?? '');
    if (!goal) notFound();
    return (
      <ProjectShell
        project={project}
        projects={await listProjects()}
        repositoryUrl={getGitHubRepositoryUrl(project)}
      >
        <JustDoItSourcePreview goal={goal} />
      </ProjectShell>
    );
  }
  const [projects, folders, nodes, runs] = await Promise.all([
    listProjects(),
    readContextBrowser(project, ['task-breakdown']),
    listTaskGraphNodes(project),
    listLatestTaskDecompositionRuns(project),
  ]);
  const graphPreview =
    process.env.NODE_ENV !== 'development'
      ? null
      : preview === 'graph-layout'
        ? createTaskGraphPreview()
        : preview === 'refining-flow'
          ? createTaskGraphRefiningPreview()
          : null;

  return (
    <ProjectShell
      project={project}
      projects={projects}
      repositoryUrl={getGitHubRepositoryUrl(project)}
    >
      <TaskDecompositionWorkspace
        projectId={project.id}
        folders={folders}
        initialNodes={graphPreview?.nodes ?? nodes}
        initialPreviews={graphPreview?.previews ?? []}
        initialRuns={graphPreview ? [] : runs}
        developmentPreview={graphPreview !== null}
        developmentPreviewSequence={graphPreview?.sequence}
      />
    </ProjectShell>
  );
}
