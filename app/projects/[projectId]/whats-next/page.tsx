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
import { findDemoSource } from '@/lib/just-do-it-demo';
import { JustDoItSourcePreview } from '@/components/just-do-it-source-preview';
import {
  createWhatsNextAttentionPreview,
  createWhatsNextErrorPreview,
  createWhatsNextRefiningPreview,
  createWhatsNextReviewPreview,
  createWhatsNextRedoPreview,
} from '@/lib/whats-next-preview';

export const dynamic = 'force-dynamic';

export default async function WhatsNextPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ preview?: string; node?: string }>;
}) {
  const { projectId } = await params;
  const { preview, node } = await searchParams;
  const project = await getProject(projectId);
  if (!project) notFound();
  if (preview === 'implementation-source') {
    const goal = findDemoSource("What's Next", node ?? '');
    if (!goal) notFound();
    return (
      <ProjectShell
        project={project}
        projects={await listProjects()}
        repositoryUrl={getGitHubRepositoryUrl(project)}
      >
        <JustDoItSourcePreview goal={goal} />
      </ProjectShell>
    );
  }
  const [projects, folders, nodes] = await Promise.all([
    listProjects(),
    readContextBrowser(project, ['mvp-prototype', 'product-design']),
    listTaskGraphNodes(project, 'whats-next'),
  ]);
  const reviewPreview =
    process.env.NODE_ENV !== 'development'
      ? null
      : preview === 'redo-flow'
        ? createWhatsNextRedoPreview()
        : preview === 'review-flow'
          ? createWhatsNextReviewPreview()
          : preview === 'latest-response-attention'
            ? createWhatsNextAttentionPreview()
            : preview === 'latest-response-error'
              ? createWhatsNextErrorPreview()
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
        developmentTransitionRun={reviewPreview?.transitionRun}
        developmentCompletionRun={reviewPreview?.completionRun}
      />
    </ProjectShell>
  );
}
