import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

export type ImportForm =
  | 'static-import'
  | 'side-effect-import'
  | 'runtime-re-export'
  | 'star-re-export'
  | 'dynamic-import'
  | 'require';

export type RuntimeEdge = {
  from: string;
  to: string;
  line: number;
  column: number;
  form: ImportForm;
  specifier: string;
};

export type TypeOnlyEdge = {
  from: string;
  to: string;
  line: number;
  column: number;
  specifier: string;
  form: 'type-import' | 'type-re-export';
};

export type UnresolvedImport = {
  from: string;
  line: number;
  column: number;
  specifier: string | null;
  reason: 'non-literal' | 'unresolved-internal';
  form: ImportForm;
};

export type RuntimeSurface = {
  name: string;
  entryPoints: string[];
};

export type StronglyConnectedComponent = {
  files: string[];
  edges: RuntimeEdge[];
  reachableFrom: string[];
};

export type DependencyGraph = {
  sourceRoots: string[];
  exclusions: string[];
  modules: string[];
  runtimeEdges: RuntimeEdge[];
  typeOnlyEdges: TypeOnlyEdge[];
  unresolvedImports: UnresolvedImport[];
  externalSpecifiers: string[];
  surfaces: RuntimeSurface[];
  components: StronglyConnectedComponent[];
};

export type AnalyzeOptions = {
  projectRoot: string;
  sourceRoots: string[];
  exclusions?: string[];
  aliasPrefix?: string;
  aliasTarget?: string;
  surfaces?: Array<{ name: string; entryPatterns: RegExp[] }>;
  extensions?: readonly string[];
};

const DEFAULT_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.mts',
  '.mjs',
  '.js',
  '.jsx',
] as const;

const SOURCE_EXTENSIONS: ReadonlySet<string> = new Set(DEFAULT_EXTENSIONS);

function scriptKindFor(file: string) {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (file.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (file.endsWith('.mjs') || file.endsWith('.js')) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function listSourceFiles(
  root: string,
  projectRoot: string,
  exclusions: string[],
): string[] {
  if (!existsSync(root)) return [];
  const found: string[] = [];
  const walk = (directory: string) => {
    const entries = readdirSync(directory, { withFileTypes: true });
    for (const entry of [...entries].sort((left, right) =>
      left.name.localeCompare(right.name),
    )) {
      const full = path.join(directory, entry.name);
      const relative = path.relative(projectRoot, full);
      if (exclusions.some((pattern) => relative.startsWith(pattern))) continue;
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) found.push(full);
    }
  };
  const info = statSync(root);
  if (info.isFile())
    return SOURCE_EXTENSIONS.has(path.extname(root)) ? [root] : [];
  walk(root);
  return found.sort((left, right) => left.localeCompare(right));
}

function resolveCandidate(candidate: string): string | null {
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  for (const extension of DEFAULT_EXTENSIONS) {
    const withExtension = `${candidate}${extension}`;
    if (existsSync(withExtension)) return withExtension;
  }
  const withoutExtension = candidate.replace(/\.(js|mjs)$/, '');
  if (withoutExtension !== candidate)
    for (const extension of ['.ts', '.tsx', '.mts'] as const) {
      const swapped = `${withoutExtension}${extension}`;
      if (existsSync(swapped)) return swapped;
    }
  if (existsSync(candidate) && statSync(candidate).isDirectory())
    for (const extension of DEFAULT_EXTENSIONS) {
      const index = path.join(candidate, `index${extension}`);
      if (existsSync(index)) return index;
    }
  return null;
}

function isInternalSpecifier(specifier: string, aliasPrefix: string) {
  return specifier.startsWith('.') || specifier.startsWith(aliasPrefix);
}

export function analyzeRuntimeDependencies(
  options: AnalyzeOptions,
): DependencyGraph {
  const projectRoot = path.resolve(options.projectRoot);
  const aliasPrefix = options.aliasPrefix ?? '@/';
  const aliasTarget = options.aliasTarget ?? projectRoot;
  const exclusions = [...(options.exclusions ?? [])].sort();
  const sourceRoots = [...options.sourceRoots].sort();

  const files: string[] = [];
  for (const root of sourceRoots)
    files.push(
      ...listSourceFiles(
        path.resolve(projectRoot, root),
        projectRoot,
        exclusions,
      ),
    );
  const modules = [...new Set(files)]
    .map((file) => path.relative(projectRoot, file))
    .sort((left, right) => left.localeCompare(right));
  const owned = new Set(modules);

  const runtimeEdges: RuntimeEdge[] = [];
  const typeOnlyEdges: TypeOnlyEdge[] = [];
  const unresolvedImports: UnresolvedImport[] = [];
  const externalSpecifiers = new Set<string>();

  for (const relativeFile of modules) {
    const absoluteFile = path.join(projectRoot, relativeFile);
    const text = readFileSync(absoluteFile, 'utf8');
    const source = ts.createSourceFile(
      absoluteFile,
      text,
      ts.ScriptTarget.ESNext,
      true,
      scriptKindFor(absoluteFile),
    );
    if (
      (source as unknown as { parseDiagnostics?: unknown[] }).parseDiagnostics
        ?.length
    )
      throw new Error(
        `Failed to parse ${relativeFile}: ${
          ((
            source as unknown as {
              parseDiagnostics: Array<{ messageText: unknown }>;
            }
          ).parseDiagnostics[0]?.messageText ?? 'unknown parse error') as string
        }`,
      );

    const positionOf = (node: ts.Node) => {
      const { line, character } = source.getLineAndCharacterOfPosition(
        node.getStart(source),
      );
      return { line: line + 1, column: character + 1 };
    };

    const record = (
      specifier: string,
      node: ts.Node,
      form: ImportForm,
      typeOnly: boolean,
    ) => {
      const { line, column } = positionOf(node);
      if (!isInternalSpecifier(specifier, aliasPrefix)) {
        externalSpecifiers.add(specifier);
        return;
      }
      const base = specifier.startsWith(aliasPrefix)
        ? path.join(aliasTarget, specifier.slice(aliasPrefix.length))
        : path.resolve(path.dirname(absoluteFile), specifier);
      const resolved = resolveCandidate(base);
      if (!resolved) {
        unresolvedImports.push({
          from: relativeFile,
          line,
          column,
          specifier,
          reason: 'unresolved-internal',
          form,
        });
        return;
      }
      const target = path.relative(projectRoot, resolved);
      if (!owned.has(target)) return;
      if (typeOnly) {
        typeOnlyEdges.push({
          from: relativeFile,
          to: target,
          line,
          column,
          specifier,
          form: form === 'static-import' ? 'type-import' : 'type-re-export',
        });
        return;
      }
      runtimeEdges.push({
        from: relativeFile,
        to: target,
        line,
        column,
        form,
        specifier,
      });
    };

    const visit = (node: ts.Node) => {
      if (ts.isImportDeclaration(node)) {
        const specifier = node.moduleSpecifier;
        if (ts.isStringLiteral(specifier)) {
          const clause = node.importClause;
          const bindings = clause?.namedBindings;
          const everyBindingIsType =
            clause !== undefined &&
            clause.name === undefined &&
            bindings !== undefined &&
            ts.isNamedImports(bindings) &&
            bindings.elements.length > 0 &&
            bindings.elements.every((element) => element.isTypeOnly);
          const clausePhase =
            clause?.phaseModifier === ts.SyntaxKind.TypeKeyword;
          const typeOnly = clausePhase || everyBindingIsType;
          record(
            specifier.text,
            node,
            clause ? 'static-import' : 'side-effect-import',
            typeOnly,
          );
        }
      } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
        const specifier = node.moduleSpecifier;
        if (ts.isStringLiteral(specifier)) {
          const clause = node.exportClause;
          const everyBindingIsType =
            clause !== undefined &&
            ts.isNamedExports(clause) &&
            clause.elements.length > 0 &&
            clause.elements.every((element) => element.isTypeOnly);
          const typeOnly = node.isTypeOnly || everyBindingIsType;
          record(
            specifier.text,
            node,
            clause ? 'runtime-re-export' : 'star-re-export',
            typeOnly,
          );
        }
      } else if (ts.isCallExpression(node)) {
        const isDynamic = node.expression.kind === ts.SyntaxKind.ImportKeyword;
        const isRequire =
          ts.isIdentifier(node.expression) &&
          node.expression.text === 'require';
        if (isDynamic || isRequire) {
          const argument = node.arguments[0];
          const form: ImportForm = isDynamic ? 'dynamic-import' : 'require';
          if (argument && ts.isStringLiteral(argument)) {
            record(argument.text, node, form, false);
          } else if (argument) {
            const { line, column } = positionOf(node);
            unresolvedImports.push({
              from: relativeFile,
              line,
              column,
              specifier: null,
              reason: 'non-literal',
              form,
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  runtimeEdges.sort(compareEdges);
  typeOnlyEdges.sort(compareEdges);
  unresolvedImports.sort(
    (left, right) =>
      left.from.localeCompare(right.from) || left.line - right.line,
  );

  const surfaces = (options.surfaces ?? []).map((surface) => ({
    name: surface.name,
    entryPoints: modules
      .filter((module) =>
        surface.entryPatterns.some((pattern) => pattern.test(module)),
      )
      .sort((left, right) => left.localeCompare(right)),
  }));

  const components = stronglyConnectedComponents(modules, runtimeEdges).map(
    (files) => ({
      files,
      edges: runtimeEdges.filter(
        (edge) => files.includes(edge.from) && files.includes(edge.to),
      ),
      reachableFrom: surfaces
        .filter((surface) =>
          surface.entryPoints.some((entry) =>
            reaches(entry, new Set(files), runtimeEdges),
          ),
        )
        .map((surface) => surface.name),
    }),
  );

  return {
    sourceRoots,
    exclusions,
    modules,
    runtimeEdges,
    typeOnlyEdges,
    unresolvedImports,
    externalSpecifiers: [...externalSpecifiers].sort(),
    surfaces,
    components,
  };
}

function compareEdges(
  left: { from: string; to: string; line: number },
  right: { from: string; to: string; line: number },
) {
  return (
    left.from.localeCompare(right.from) ||
    left.line - right.line ||
    left.to.localeCompare(right.to)
  );
}

function reaches(
  entry: string,
  targets: Set<string>,
  edges: RuntimeEdge[],
): boolean {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const list = adjacency.get(edge.from) ?? [];
    list.push(edge.to);
    adjacency.set(edge.from, list);
  }
  const seen = new Set<string>();
  const stack = [entry];
  while (stack.length) {
    const current = stack.pop()!;
    if (targets.has(current)) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const next of adjacency.get(current) ?? []) stack.push(next);
  }
  return false;
}

export function stronglyConnectedComponents(
  nodes: string[],
  edges: Array<{ from: string; to: string }>,
): string[][] {
  const adjacency = new Map<string, string[]>();
  for (const node of nodes) adjacency.set(node, []);
  for (const edge of edges)
    if (adjacency.has(edge.from) && adjacency.has(edge.to))
      adjacency.get(edge.from)!.push(edge.to);
  for (const [key, list] of adjacency)
    adjacency.set(
      key,
      [...new Set(list)].sort((a, b) => a.localeCompare(b)),
    );

  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const components: string[][] = [];
  let counter = 0;

  const ordered = [...nodes].sort((a, b) => a.localeCompare(b));
  for (const start of ordered) {
    if (index.has(start)) continue;
    const work: Array<{ node: string; children: string[]; cursor: number }> = [
      { node: start, children: adjacency.get(start) ?? [], cursor: 0 },
    ];
    index.set(start, counter);
    low.set(start, counter);
    counter += 1;
    stack.push(start);
    onStack.add(start);

    while (work.length) {
      const frame = work[work.length - 1]!;
      if (frame.cursor < frame.children.length) {
        const child = frame.children[frame.cursor]!;
        frame.cursor += 1;
        if (!index.has(child)) {
          index.set(child, counter);
          low.set(child, counter);
          counter += 1;
          stack.push(child);
          onStack.add(child);
          work.push({
            node: child,
            children: adjacency.get(child) ?? [],
            cursor: 0,
          });
        } else if (onStack.has(child)) {
          low.set(
            frame.node,
            Math.min(low.get(frame.node)!, index.get(child)!),
          );
        }
        continue;
      }
      work.pop();
      const parent = work[work.length - 1];
      if (parent)
        low.set(
          parent.node,
          Math.min(low.get(parent.node)!, low.get(frame.node)!),
        );
      if (low.get(frame.node) === index.get(frame.node)) {
        const component: string[] = [];
        let member: string;
        do {
          member = stack.pop()!;
          onStack.delete(member);
          component.push(member);
        } while (member !== frame.node);
        const selfLoop =
          component.length === 1 &&
          (adjacency.get(component[0]!) ?? []).includes(component[0]!);
        if (component.length > 1 || selfLoop)
          components.push(component.sort((a, b) => a.localeCompare(b)));
      }
    }
  }
  return components.sort((left, right) => left[0]!.localeCompare(right[0]!));
}
