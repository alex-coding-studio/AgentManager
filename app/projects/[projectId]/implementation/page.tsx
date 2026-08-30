import { notFound } from 'next/navigation';
import { ProjectShell } from '@/components/project-shell';
import { JustDoItEntry } from '@/components/just-do-it-entry';
import {
  getGitHubRepositoryUrl,
  getProject,
  listProjects,
} from '@/lib/project-registry';

export const dynamic = 'force-dynamic';

export default async function ImplementationPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ preview?: string | string[] }>;
}) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) notFound();
  const projects = await listProjects();
  const preview = (await searchParams).preview === 'just-do-it';
  const Workspace = preview
    ? (await import('@/components/just-do-it-workspace')).JustDoItWorkspace
    : JustDoItEntry;
  return (
    <ProjectShell
      project={project}
      projects={projects}
      repositoryUrl={getGitHubRepositoryUrl(project)}
    >
      <Workspace
        key={project.id}
        projectId={project.id}
        projectPath={project.rootPath}
      />
    </ProjectShell>
  );
}
