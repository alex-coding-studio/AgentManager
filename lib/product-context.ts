import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { RegisteredProject } from '@/lib/project-registry';

export type ContextSection = {
  slug: string;
  title: string;
  summary: string;
  markdown: string;
};

const sectionTemplates = [
  {
    slug: 'product',
    markdown: `# Product

Product documents define who the product serves, which problems it solves, and how user-visible behavior should work.

## Put here

- Product foundations and positioning
- User journeys and experience contracts
- Behavioral rules and product decisions

## Keep elsewhere

Visual specifications belong in Design. Implementation constraints belong in Engineering. Active task state belongs in the task graph.

## Agent reading guidance

Read this section when clarifying requirements, decomposing user-facing capabilities, or checking whether implementation matches product intent.
`,
  },
  {
    slug: 'design',
    markdown: `# Design

Design documents describe the intended visual language, interaction patterns, information hierarchy, and human acceptance references.

## Put here

- Visual direction and interface principles
- Interaction flows and component behavior
- Reference screenshots and design acceptance notes

## Keep elsewhere

Product behavior that remains true without a particular interface belongs in Product. Code architecture belongs in Engineering.

## Agent reading guidance

Read this section for UI-bearing work, interaction decisions, and preparation for human visual acceptance.
`,
  },
  {
    slug: 'engineering',
    markdown: `# Engineering

Engineering documents capture durable technical boundaries that affect how work can be implemented and verified.

## Put here

- Architecture and data-model decisions
- Platform constraints and integration boundaries
- Repository conventions that are specific to this product

## Keep elsewhere

Generic agent instructions belong in shared infrastructure. Temporary debugging notes and task status do not belong here.

## Agent reading guidance

Read only the relevant documents when a task crosses a technical boundary or requires an architectural decision.
`,
  },
  {
    slug: 'milestones',
    markdown: `# Milestones

Milestone documents describe bounded, human-verifiable product outcomes that provide context for task decomposition.

## Put here

- Accepted milestone scope
- User-visible acceptance journeys
- Frozen handoffs that explain a milestone boundary

## Keep elsewhere

Live task readiness, dependency state, pull requests, and completion status belong in the task graph rather than these documents.

## Agent reading guidance

Read the active milestone when decomposing or implementing work inside that outcome. Do not treat milestone prose as live task state.
`,
  },
  {
    slug: 'references',
    markdown: `# References

Reference documents preserve external research and supporting material that may inform product or implementation decisions.

## Put here

- Research summaries and source notes
- Platform documentation relevant to this product
- Competitive or comparative observations

## Keep elsewhere

Verified product decisions should be promoted to Product, Design, or Engineering instead of remaining only as reference material.

## Agent reading guidance

Read this section only when the task names a source or when a specific unresolved question requires supporting evidence.
`,
  },
  {
    slug: 'other',
    markdown: `# Other

This section is a temporary home for useful product context that does not yet have a clear category.

## Put here

- Relevant context that cannot currently be classified
- Early material awaiting a durable owner

## Keep elsewhere

Move stable material into Product, Design, Engineering, Milestones, or References once its role becomes clear.

## Agent reading guidance

Do not load this section by default. Read it only when a task explicitly points here or other sections are insufficient.
`,
  },
] as const;

const rootReadme = `# Product Context

This directory contains the human-readable context that AgentManager uses to understand and decompose work for this product.

Each section is a folder with its own README. Read the section README before loading its individual documents so Agent context can remain bounded.

## Sections

- Product defines user-visible intent and behavior.
- Design defines visual and interaction intent.
- Engineering defines durable technical boundaries.
- Milestones define bounded outcomes used for decomposition.
- References preserve supporting research and source material.
- Other temporarily holds material without a clear owner.

The directory layout is owned by AgentManager. Task state and dependency relationships are stored separately from Product Context.
`;

async function writeIfMissing(filePath: string, content: string) {
  try {
    await writeFile(filePath, content, { flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
}

export async function initializeProductContext(project: RegisteredProject) {
  const contextPath = path.join(project.planningPath, 'context');
  await mkdir(contextPath, { recursive: true });
  await writeIfMissing(path.join(contextPath, 'README.md'), rootReadme);

  for (const section of sectionTemplates) {
    const sectionPath = path.join(contextPath, section.slug);
    await mkdir(sectionPath, { recursive: true });
    await writeIfMissing(path.join(sectionPath, 'README.md'), section.markdown);
  }

  return readProductContext(project);
}

export async function readProductContext(project: RegisteredProject) {
  const contextPath = path.join(project.planningPath, 'context');
  const entries = await readdir(contextPath, { withFileTypes: true }).catch(
    () => [],
  );
  const directories = entries.filter(
    (entry) => entry.isDirectory() && /^[a-z0-9][a-z0-9-]*$/.test(entry.name),
  );
  const preferredOrder = sectionTemplates.map((section) => section.slug);
  directories.sort((left, right) => {
    const leftIndex = preferredOrder.indexOf(left.name as never);
    const rightIndex = preferredOrder.indexOf(right.name as never);
    if (leftIndex === -1 && rightIndex === -1) {
      return left.name.localeCompare(right.name);
    }
    if (leftIndex === -1) return 1;
    if (rightIndex === -1) return -1;
    return leftIndex - rightIndex;
  });

  const sections = await Promise.all(
    directories.map(async (directory) => {
      const markdown = await readFile(
        path.join(contextPath, directory.name, 'README.md'),
        'utf8',
      ).catch(() => '');
      return {
        slug: directory.name,
        title: readTitle(markdown, directory.name),
        summary: readSummary(markdown),
        markdown,
      } satisfies ContextSection;
    }),
  );

  return sections;
}

function readTitle(markdown: string, fallback: string) {
  const heading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (heading) return heading;
  return fallback
    .split('-')
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');
}

function readSummary(markdown: string) {
  return (
    markdown
      .split(/\n\s*\n/)
      .map((paragraph) => paragraph.trim())
      .find((paragraph) => paragraph && !paragraph.startsWith('#')) ??
    'No section guidance yet.'
  );
}
