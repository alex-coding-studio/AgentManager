import { notFound } from 'next/navigation';
import { ProjectShell } from '@/components/project-shell';
import { TaskDecompositionContextWorkspace } from '@/components/task-decomposition-context-workspace';
import {
  getGitHubRepositoryUrl,
  getProject,
  listProjects,
} from '@/lib/project-registry';
import { readTaskDecompositionContext } from '@/lib/task-decomposition-context';

export const dynamic = 'force-dynamic';

export default async function TaskDecompositionContextPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) notFound();
  const [projects, context] = await Promise.all([
    listProjects(),
    readTaskDecompositionContext(project),
  ]);

  return (
    <ProjectShell
      project={project}
      projects={projects}
      repositoryUrl={getGitHubRepositoryUrl(project)}
    >
      <TaskDecompositionContextWorkspace
        projectId={project.id}
        initialContext={context}
      />
    </ProjectShell>
  );
}
