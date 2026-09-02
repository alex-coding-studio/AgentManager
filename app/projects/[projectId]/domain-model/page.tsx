import { notFound } from 'next/navigation';
import { DomainModelWorkspace } from '@/components/domain-model-workspace';
import { ProjectShell } from '@/components/project-shell';
import { readDomainModelView } from '@/lib/domain-model';
import { listLatestDomainModelRuns } from '@/lib/domain-model-runs';
import {
  getGitHubRepositoryUrl,
  getProject,
  listProjects,
} from '@/lib/project-registry';

export const dynamic = 'force-dynamic';

export default async function DomainModelPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const project = await getProject((await params).projectId);
  if (!project) notFound();
  const [projects, view, runs] = await Promise.all([
    listProjects(),
    readDomainModelView(project),
    listLatestDomainModelRuns(project),
  ]);
  return (
    <ProjectShell
      project={project}
      projects={projects}
      repositoryUrl={getGitHubRepositoryUrl(project)}
    >
      <DomainModelWorkspace
        projectId={project.id}
        initialModel={view.model}
        initialRuns={runs}
        initialCanUndo={view.canUndo}
        initialLastChange={view.lastChange}
      />
    </ProjectShell>
  );
}
