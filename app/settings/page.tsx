import Link from 'next/link';
import { ProjectShell } from '@/components/project-shell';
import { SettingsWorkspace } from '@/components/settings-workspace';
import { listProjects, getGitHubRepositoryUrl } from '@/lib/project-registry';
import { readAppSettings } from '@/lib/app-settings';
import { translateUi } from '@/lib/ui-language';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const [{ project: projectId }, projects, settings] = await Promise.all([
    searchParams,
    listProjects(),
    readAppSettings(),
  ]);
  const project =
    projects.find((project) => project.id === projectId) ?? projects[0];
  if (project)
    return (
      <ProjectShell
        project={project}
        projects={projects}
        repositoryUrl={getGitHubRepositoryUrl(project)}
      >
        <SettingsWorkspace />
      </ProjectShell>
    );
  return (
    <main className="min-h-screen bg-background">
      <header className="flex h-16 items-center justify-between border-b border-border px-6">
        <Link href="/" className="font-semibold">
          AgentManager
        </Link>
        <Link href="/" className="text-sm text-muted-foreground">
          {translateUi(settings.language, 'Back to projects')}
        </Link>
      </header>
      <SettingsWorkspace />
    </main>
  );
}
