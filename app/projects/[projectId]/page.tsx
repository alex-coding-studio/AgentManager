import { notFound } from 'next/navigation';
import { ArrowRight, Boxes, GitFork, Library } from 'lucide-react';
import { ProjectShell } from '@/components/project-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  getGitHubRepositoryUrl,
  getProject,
  listProjects,
} from '@/lib/project-registry';

export const dynamic = 'force-dynamic';

export default async function ProjectPage({
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
  const repositoryUrl = getGitHubRepositoryUrl(project);

  return (
    <ProjectShell
      project={project}
      projects={projects}
      repositoryUrl={repositoryUrl}
    >
      <div className="mx-auto max-w-6xl px-5 py-9 lg:px-8 lg:py-12">
        <div className="max-w-2xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Project overview
          </p>
          <h1 className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
            {project.name}
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {project.description || 'No project description yet.'}
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          <SummaryCard icon={<Library />} label="Product sources" value="0" />
          <SummaryCard icon={<Boxes />} label="Task pieces" value="0" />
          <SummaryCard icon={<GitFork />} label="Dependencies" value="0" />
        </div>

        <Card className="mt-6 border-0 shadow-[0_1px_0_rgb(15_23_42/5%),0_14px_40px_rgb(15_23_42/5%)]">
          <CardHeader className="border-b">
            <CardTitle>Workspace ready</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5 py-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">The project boundary is connected.</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Product context, task decomposition, and dependency sync will be
                added as focused capabilities.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-sm font-medium text-muted-foreground">
              Next: product context <ArrowRight className="size-4" />
            </div>
          </CardContent>
        </Card>
      </div>
    </ProjectShell>
  );
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card className="border-0 shadow-[0_1px_0_rgb(15_23_42/5%),0_10px_30px_rgb(15_23_42/4%)]">
      <CardContent className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
        </div>
        <div className="grid size-10 place-items-center rounded-xl bg-secondary text-muted-foreground [&_svg]:size-4">
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}
