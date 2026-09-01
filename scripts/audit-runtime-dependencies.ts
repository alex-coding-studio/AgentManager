import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  analyzeRuntimeDependencies,
  type DependencyGraph,
} from '../lib/runtime-dependency-graph.ts';

export const AUDIT_SOURCE_ROOTS = [
  'app',
  'bin',
  'components',
  'hooks',
  'lib',
  'scripts',
];

export const AUDIT_EXCLUSIONS = [
  '.next',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'tests',
];

export const AUDIT_SURFACES = [
  {
    name: 'next-application',
    entryPatterns: [
      /^app\/.*\/(page|layout|route)\.tsx?$/,
      /^app\/[^/]+\.tsx$/,
    ],
  },
  {
    name: 'node-cli',
    entryPatterns: [/^bin\/[^/]+\.mjs$/],
  },
  {
    name: 'maintenance-scripts',
    entryPatterns: [/^scripts\/[^/]+\.(ts|mjs)$/],
  },
];

export function auditProjectRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

export function runAudit(projectRoot = auditProjectRoot()): DependencyGraph {
  return analyzeRuntimeDependencies({
    projectRoot,
    sourceRoots: AUDIT_SOURCE_ROOTS,
    exclusions: AUDIT_EXCLUSIONS,
    aliasPrefix: '@/',
    aliasTarget: projectRoot,
    surfaces: AUDIT_SURFACES,
  });
}

export function formatAudit(graph: DependencyGraph) {
  const lines: string[] = [];
  lines.push('# Runtime dependency audit');
  lines.push('');
  lines.push(`input fingerprint: ${graph.inputFingerprint}`);
  lines.push(`analyzed source roots: ${graph.sourceRoots.join(', ')}`);
  lines.push(`exclusions: ${graph.exclusions.join(', ')}`);
  lines.push(`owned modules: ${graph.modules.length}`);
  lines.push(`runtime edges: ${graph.runtimeEdges.length}`);
  lines.push(`type-only edges excluded: ${graph.typeOnlyEdges.length}`);
  lines.push(`external specifiers: ${graph.externalSpecifiers.length}`);
  lines.push(`unresolved internal imports: ${graph.unresolvedImports.length}`);
  lines.push(
    `internal imports outside the analyzed graph: ${graph.excludedInternalImports.length}`,
  );
  lines.push(`non-module asset references: ${graph.assetImports.length}`);
  lines.push(
    `runtime strongly connected components: ${graph.components.length}`,
  );
  lines.push('');

  for (const surface of graph.surfaces)
    lines.push(
      `surface ${surface.name}: ${surface.entryPoints.length} entry points`,
    );
  lines.push('');

  lines.push('## Non-module asset references');
  if (graph.assetImports.length)
    for (const item of graph.assetImports)
      lines.push(`- ${item.from}:${item.line}:${item.column} -> ${item.to}`);
  else lines.push('- none');
  lines.push('');

  if (graph.excludedInternalImports.length) {
    lines.push('## Internal imports outside the analyzed graph');
    for (const item of graph.excludedInternalImports)
      lines.push(
        `- ${item.from}:${item.line}:${item.column} -> ${item.to} [${item.form}]`,
      );
    lines.push('');
  } else {
    lines.push('## Internal imports outside the analyzed graph');
    lines.push('- none');
    lines.push('');
  }

  if (graph.unresolvedImports.length) {
    lines.push('## Unresolved internal imports');
    for (const item of graph.unresolvedImports)
      lines.push(
        `- ${item.from}:${item.line}:${item.column} ${item.form} ${item.specifier ?? '(non-literal)'} [${item.reason}]`,
      );
    lines.push('');
  } else {
    lines.push('## Unresolved internal imports');
    lines.push('- none');
    lines.push('');
  }

  if (!graph.components.length) {
    lines.push('## Runtime strongly connected components');
    lines.push('- none');
    lines.push('');
  } else {
    lines.push('## Runtime strongly connected components');
    for (const [position, component] of graph.components.entries()) {
      lines.push('');
      lines.push(`### Component ${position + 1}`);
      lines.push(`files (${component.files.length}):`);
      for (const file of component.files) lines.push(`- ${file}`);
      lines.push(
        `reachable from: ${component.reachableFrom.join(', ') || 'no known entry point'}`,
      );
      lines.push(`internal runtime edges (${component.edges.length}):`);
      for (const edge of component.edges)
        lines.push(
          `- ${edge.from}:${edge.line}:${edge.column} -> ${edge.to} [${edge.form}] '${edge.specifier}'`,
        );
    }
    lines.push('');
  }
  return lines.join('\n');
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  try {
    const graph = runAudit();
    process.stdout.write(`${formatAudit(graph)}\n`);
    if (
      graph.unresolvedImports.some(
        (item) => item.reason === 'unresolved-internal',
      )
    ) {
      process.stderr.write(
        'Audit incomplete: unresolved internal imports make the graph untrustworthy.\n',
      );
      process.exit(2);
    }
    if (graph.excludedInternalImports.length) {
      process.stderr.write(
        'Audit incomplete: owned modules import internal files outside the analyzed graph.\n',
      );
      process.exit(3);
    }
    process.exit(0);
  } catch (error) {
    process.stderr.write(
      `Audit failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  }
}
