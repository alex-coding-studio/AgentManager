import { notFound } from 'next/navigation';
import { ProjectShell } from '@/components/project-shell';
import { WhatsNextWorkspace } from '@/components/whats-next-workspace';
import { readContextBrowser } from '@/lib/product-context';
import {
  getGitHubRepositoryUrl,
  getProject,
  listProjects,
} from '@/lib/project-registry';
import { listTaskGraphNodes } from '@/lib/task-graph';

export const dynamic = 'force-dynamic';

export default async function WhatsNextPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) notFound();
  const [projects, folders, nodes] = await Promise.all([
    listProjects(),
    readContextBrowser(project),
    listTaskGraphNodes(project, 'whats-next'),
  ]);

  return (
    <ProjectShell
      project={project}
      projects={projects}
      repositoryUrl={getGitHubRepositoryUrl(project)}
    >
      <WhatsNextWorkspace
        projectId={project.id}
        folders={folders}
        initialNodes={nodes}
      />
    </ProjectShell>
  );
}
