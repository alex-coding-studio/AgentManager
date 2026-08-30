import { notFound } from 'next/navigation';
import { ProjectShell } from '@/components/project-shell';
import { JustDoItWorkspace } from '@/components/just-do-it-workspace';
import {
  getGitHubRepositoryUrl,
  getProject,
  listProjects,
} from '@/lib/project-registry';

export const dynamic = 'force-dynamic';

export default async function ImplementationPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) notFound();
  const projects = await listProjects();
  return (
    <ProjectShell
      project={project}
      projects={projects}
      repositoryUrl={getGitHubRepositoryUrl(project)}
    >
      <JustDoItWorkspace key={project.id} />
    </ProjectShell>
  );
}
