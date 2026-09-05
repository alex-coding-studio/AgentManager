import { notFound } from 'next/navigation';
import { LogViewer } from '@/components/log-viewer';
import { PublicApiError } from '@/lib/api-errors';
import {
  readLogChunk,
  resolveLogTarget,
} from '@/lib/execution-observability/log-targets';
import { getProject } from '@/lib/project-registry';

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
  const chunk = await readLogChunk(target, 0);
  return (
    <main className="min-h-dvh bg-background">
      <LogViewer
        apiPath={`/api/projects/${project.id}/logs/${segments.map(encodeURIComponent).join('/')}`}
        initialMeta={target.meta}
        initialChunk={chunk}
      />
    </main>
  );
}
