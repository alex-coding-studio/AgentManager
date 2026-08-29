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
import {
  createWhatsNextRefiningPreview,
  createWhatsNextReviewPreview,
} from '@/lib/whats-next-preview';

export const dynamic = 'force-dynamic';

export default async function WhatsNextPage({
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
    listTaskGraphNodes(project, 'whats-next'),
  ]);
  const reviewPreview =
    process.env.NODE_ENV !== 'development'
      ? null
      : preview === 'review-flow'
        ? createWhatsNextReviewPreview()
        : preview === 'refining-flow'
          ? createWhatsNextRefiningPreview()
          : null;

  return (
    <ProjectShell
      project={project}
      projects={projects}
      repositoryUrl={getGitHubRepositoryUrl(project)}
    >
      <WhatsNextWorkspace
        projectId={project.id}
        folders={folders}
        initialNodes={reviewPreview?.nodes ?? nodes}
        initialRuns={reviewPreview?.runs ?? []}
        developmentPreview={reviewPreview !== null}
      />
    </ProjectShell>
  );
}
