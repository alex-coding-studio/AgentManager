import { ProjectWorkspace } from '@/components/project-workspace';
import { listProjects } from '@/lib/project-registry';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const projects = await listProjects();
  return <ProjectWorkspace initialProjects={projects} />;
}
