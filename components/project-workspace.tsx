'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  Code2,
  Folder,
  FolderOpen,
  PackagePlus,
  Plus,
  Settings,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { ProjectKind, RegisteredProject } from '@/lib/project-registry';
import { useUiText } from '@/components/ui-language-provider';

export function ProjectWorkspace({
  initialProjects,
}: {
  initialProjects: RegisteredProject[];
}) {
  const { t } = useUiText();
  const [projects, setProjects] = useState(initialProjects);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [kind, setKind] = useState<ProjectKind>('standalone');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rootPath, setRootPath] = useState('');
  const [error, setError] = useState('');

  async function chooseDirectory() {
    setChoosing(true);
    setError('');
    const response = await fetch('/api/system/select-directory', {
      method: 'POST',
    });
    const result = (await response.json()) as { path?: string; error?: string };
    setChoosing(false);
    if (!response.ok) {
      if (result.error !== 'Folder selection was cancelled.') {
        setError(result.error ?? 'Could not choose a directory.');
      }
      return;
    }
    setRootPath(result.path ?? '');
  }

  function resetForm() {
    setKind('standalone');
    setName('');
    setDescription('');
    setRootPath('');
    setError('');
  }

  async function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, name, description, rootPath }),
    });
    const result = (await response.json()) as {
      project?: RegisteredProject;
      error?: string;
    };
    setSubmitting(false);

    if (!response.ok) {
      setError(result.error ?? 'Could not create the project.');
      return;
    }

    if (!result.project) {
      setError('The project was created without a registry response.');
      return;
    }

    setProjects((current) => [result.project!, ...current]);
    setOpen(false);
    resetForm();
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/70 bg-background/95">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground">
              P
            </div>
            <div>
              <p className="font-semibold tracking-tight">Praxis</p>
              <p className="text-xs text-muted-foreground">
                {t('Project workspace')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Link
              href="/settings"
              className="mr-3 flex items-center gap-1.5 rounded-lg px-2 py-2 hover:bg-muted"
              aria-label={t('Settings')}
            >
              <Settings className="size-4" />
              {t('Settings')}
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 py-12 lg:px-8">
        <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-primary/65">
              {t('Projects')}
            </p>
            <h1 className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
              {t('Begin with a project boundary.')}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
              {t(
                'Register a product idea or an existing code repository. Planning data stays beside the project while remaining invisible to its code history.',
              )}
            </p>
          </div>

          <Dialog
            open={open}
            onOpenChange={(nextOpen) => {
              setOpen(nextOpen);
              if (!nextOpen) resetForm();
            }}
          >
            <DialogTrigger render={<Button size="lg" />}>
              <Plus /> {t('New project')}
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <form onSubmit={submit}>
                <DialogHeader>
                  <DialogTitle>{t('Create a project')}</DialogTitle>
                  <DialogDescription>
                    {t(
                      'Choose where the project lives, then add only enough context to recognize it.',
                    )}
                  </DialogDescription>
                </DialogHeader>

                <div className="my-5 space-y-5">
                  <fieldset className="space-y-2">
                    <legend className="text-xs font-medium">
                      {t('Starting point')}
                    </legend>
                    <div className="grid grid-cols-2 gap-2">
                      <KindButton
                        active={kind === 'standalone'}
                        icon={<PackagePlus />}
                        title={t('Product idea')}
                        detail={t('No code repository yet')}
                        onClick={() => setKind('standalone')}
                      />
                      <KindButton
                        active={kind === 'repository'}
                        icon={<Code2 />}
                        title={t('Code repository')}
                        detail={t('Attach existing local code')}
                        onClick={() => setKind('repository')}
                      />
                    </div>
                  </fieldset>

                  <div className="space-y-2">
                    <label
                      htmlFor="project-name"
                      className="text-xs font-medium"
                    >
                      {t('Project name')}
                    </label>
                    <Input
                      id="project-name"
                      maxLength={120}
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Praxis"
                    />
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="project-description"
                      className="text-xs font-medium"
                    >
                      {t('Description')}
                    </label>
                    <Textarea
                      id="project-description"
                      maxLength={600}
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder={t(
                        'A local-first workspace for one person building with agents.',
                      )}
                    />
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="project-directory"
                      className="text-xs font-medium"
                    >
                      {t('Project directory')}
                    </label>
                    <div className="flex gap-2">
                      <Input
                        id="project-directory"
                        value={rootPath}
                        onChange={(event) => setRootPath(event.target.value)}
                        placeholder={t('Choose an existing local directory')}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={chooseDirectory}
                        disabled={choosing}
                      >
                        <FolderOpen /> {choosing ? t('Choosing…') : t('Choose')}
                      </Button>
                    </div>
                    <p className="text-[11px] leading-4 text-muted-foreground">
                      {t(
                        'Praxis creates a locally excluded .praxis directory inside this folder.',
                      )}
                    </p>
                  </div>

                  {error ? (
                    <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {error}
                    </p>
                  ) : null}
                </div>

                <DialogFooter>
                  <Button
                    type="submit"
                    disabled={!name.trim() || !rootPath.trim() || submitting}
                  >
                    {submitting ? t('Creating…') : t('Create project')}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {projects.length === 0 ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="col-span-full flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center transition hover:border-primary/40 hover:bg-card"
            >
              <div className="grid size-12 place-items-center rounded-2xl bg-secondary">
                <Folder className="size-5" />
              </div>
              <h2 className="mt-4 font-medium">
                {t('Create the first project')}
              </h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                {t(
                  'Choose a folder, add a name, and write one short description.',
                )}
              </p>
            </button>
          ) : null}

          {projects.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`}>
              <Card className="h-full border-0 shadow-[0_1px_0_rgb(15_23_42/5%),0_14px_40px_rgb(15_23_42/5%)] transition hover:-translate-y-0.5 hover:shadow-[0_1px_0_rgb(15_23_42/5%),0_18px_50px_rgb(15_23_42/8%)]">
                <CardHeader>
                  <div className="mb-3 flex items-start justify-between gap-4">
                    <div className="grid size-10 place-items-center rounded-xl bg-secondary">
                      {project.kind === 'repository' ? (
                        <Code2 className="size-4.5" />
                      ) : (
                        <PackagePlus className="size-4.5" />
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                        {project.kind === 'repository'
                          ? t('Repository')
                          : t('Product idea')}
                      </span>
                      <ArrowUpRight className="size-4 text-muted-foreground" />
                    </div>
                  </div>
                  <CardTitle className="text-lg">{project.name}</CardTitle>
                  <CardDescription>
                    {project.description || t('No description yet.')}
                  </CardDescription>
                  <code className="mt-3 block truncate text-[11px] text-muted-foreground">
                    {project.rootPath}
                  </code>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

function KindButton({
  active,
  icon,
  title,
  detail,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-xl border p-3 text-left transition ${
        active
          ? 'border-primary bg-primary/[0.045] ring-1 ring-primary/20'
          : 'border-border hover:bg-muted/50'
      }`}
    >
      <span className="mb-3 block [&_svg]:size-4">{icon}</span>
      <span className="block text-sm font-medium">{title}</span>
      <span className="mt-0.5 block text-[11px] text-muted-foreground">
        {detail}
      </span>
    </button>
  );
}
