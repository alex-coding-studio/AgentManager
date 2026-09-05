import { notFound } from 'next/navigation';
import { LogViewer } from '@/components/log-viewer';
import { ProjectShell } from '@/components/project-shell';
import { PublicApiError } from '@/lib/api-errors';
import {
  readLogChunk,
  resolveLogTarget,
} from '@/lib/execution-observability/log-targets';
import {
  getGitHubRepositoryUrl,
  getProject,
  listProjects,
} from '@/lib/project-registry';

export const dynamic = 'force-dynamic';

export default async function LogPage({
  params,
}: {
  params: Promise<{ projectId: string; segments: string[] }>;
}) {
  const { projectId, segments } = await params;
  const project = await getProject(projectId);
  if (!project) notFound();
  let target;
  try {
    target = await resolveLogTarget(project, segments);
  } catch (error) {
    if (error instanceof PublicApiError && error.status === 404) notFound();
    throw error;
  }
  const [projects, chunk] = await Promise.all([
    listProjects(),
    readLogChunk(target, 0),
  ]);
  return (
    <ProjectShell
      project={project}
      projects={projects}
      repositoryUrl={getGitHubRepositoryUrl(project)}
    >
      <LogViewer
        apiPath={`/api/projects/${project.id}/logs/${segments.map(encodeURIComponent).join('/')}`}
        initialMeta={target.meta}
        initialChunk={chunk}
      />
    </ProjectShell>
  );
}
