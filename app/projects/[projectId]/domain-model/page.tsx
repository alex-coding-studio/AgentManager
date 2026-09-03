import { notFound } from 'next/navigation';
import { DomainModelWorkspace } from '@/components/domain-model-workspace';
import { ProjectShell } from '@/components/project-shell';
import { readDomainModelView } from '@/lib/modules/domain-modeling/model';
import { listLatestDomainModelRuns } from '@/lib/modules/domain-modeling/runs';
import { readContextBrowser } from '@/lib/modules/product-context/catalog';
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
  const [projects, view, runs, folders] = await Promise.all([
    listProjects(),
    readDomainModelView(project),
    listLatestDomainModelRuns(project),
    readContextBrowser(project, ['domain-model']),
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
        folders={folders}
      />
    </ProjectShell>
  );
}
