import { notFound } from 'next/navigation';
import { ProjectShell } from '@/components/project-shell';
import { TaskDecompositionWorkspace } from '@/components/task-decomposition-workspace';
import { readContextBrowser } from '@/lib/product-context';
import {
  getGitHubRepositoryUrl,
  getProject,
  listProjects,
} from '@/lib/project-registry';
import { listTaskGraphNodes } from '@/lib/task-graph';
import { createTaskGraphPreview } from '@/lib/task-graph-preview';

export const dynamic = 'force-dynamic';

export default async function TaskDecompositionPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { projectId } = await params;
  const { preview } = await searchParams;
  const project = await getProject(projectId);
  if (!project) notFound();
  const [projects, folders, nodes] = await Promise.all([
    listProjects(),
    readContextBrowser(project),
    listTaskGraphNodes(project),
  ]);
  const graphPreview =
    process.env.NODE_ENV === 'development' && preview === 'graph-layout'
      ? createTaskGraphPreview()
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
        developmentPreview={graphPreview !== null}
      />
    </ProjectShell>
  );
}
