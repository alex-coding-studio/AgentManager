import { notFound } from 'next/navigation';
import { ProductContextWorkspace } from '@/components/product-context-workspace';
import { ProjectShell } from '@/components/project-shell';
import {
  getGitHubRepositoryUrl,
  getProject,
  listProjects,
} from '@/lib/project-registry';
import { readProductContext } from '@/lib/modules/product-context/catalog';

export const dynamic = 'force-dynamic';

export default async function ProductContextPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const [project, projects] = await Promise.all([
    getProject(projectId),
    listProjects(),
  ]);
  if (!project) notFound();

  const sections = await readProductContext(project);
  return (
    <ProjectShell
      project={project}
      projects={projects}
      repositoryUrl={getGitHubRepositoryUrl(project)}
    >
      <ProductContextWorkspace initialSections={sections} />
    </ProjectShell>
  );
}
