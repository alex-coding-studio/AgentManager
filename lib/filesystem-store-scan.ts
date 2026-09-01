import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

export type FsOperationKind =
  | 'read'
  | 'write'
  | 'append'
  | 'rename'
  | 'remove'
  | 'trash'
  | 'mkdir'
  | 'readdir'
  | 'stat'
  | 'link'
  | 'realpath'
  | 'open';

export type FsOperation = {
  file: string;
  line: number;
  column: number;
  kind: FsOperationKind;
  callee: string;
  origin: 'node-fs' | 'local-wrapper' | 'trash-package';
  exclusiveCreate: boolean;
  insideFinally: boolean;
  enclosingFunction: string;
};

export type UnresolvedFsUsage = {
  file: string;
  line: number;
  column: number;
  expression: string;
  reason: 'dynamic-member' | 'unresolved-alias';
};

export type ModuleSignals = {
  file: string;
  importsAtomicStore: boolean;
  atomicStoreCalls: string[];
  serializationKeys: string[];
  temporaryNameConstructions: number;
  exclusiveCreateCount: number;
  renameCount: number;
  gitInvocations: number;
  symlinkChecks: number;
  containmentChecks: number;
  cleanupInFinally: number;
  localWriteWrappers: string[];
  multiWriteFunctions: Array<{ name: string; writes: number }>;
};

export type StoreScan = {
  inputFingerprint: string;
  sourceRoots: string[];
  exclusions: string[];
  analyzedFiles: string[];
  operations: FsOperation[];
  unresolved: UnresolvedFsUsage[];
  modules: ModuleSignals[];
  omittedFilesystemFiles: string[];
};

const FS_MODULES = new Set([
  'node:fs',
  'node:fs/promises',
  'fs',
  'fs/promises',
]);

const KIND_BY_METHOD: Record<string, FsOperationKind> = {
  readFile: 'read',
  readFileSync: 'read',
  writeFile: 'write',
  writeFileSync: 'write',
  appendFile: 'append',
  appendFileSync: 'append',
  rename: 'rename',
  renameSync: 'rename',
  unlink: 'remove',
  unlinkSync: 'remove',
  rm: 'remove',
  rmSync: 'remove',
  rmdir: 'remove',
  mkdir: 'mkdir',
  mkdirSync: 'mkdir',
  mkdtemp: 'mkdir',
  mkdtempSync: 'mkdir',
  readdir: 'readdir',
  readdirSync: 'readdir',
  stat: 'stat',
  statSync: 'stat',
  lstat: 'stat',
  lstatSync: 'stat',
  access: 'stat',
  symlink: 'link',
  readlink: 'link',
  realpath: 'realpath',
  realpathSync: 'realpath',
  open: 'open',
  cp: 'write',
  copyFile: 'write',
};

const WRITE_KINDS = new Set<FsOperationKind>([
  'write',
  'append',
  'rename',
  'remove',
  'trash',
]);

const SOURCE_EXTENSIONS: ReadonlySet<string> = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.mjs',
]);

function listFiles(root: string, projectRoot: string, exclusions: string[]) {
  if (!existsSync(root)) return [];
  const found: string[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
      (left, right) => left.name.localeCompare(right.name),
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
  if (statSync(root).isFile()) return [root];
  walk(root);
  return found;
}

function enclosingFunctionName(node: ts.Node): string {
  let current: ts.Node | undefined = node;
  while (current) {
    if (ts.isFunctionDeclaration(current) && current.name)
      return current.name.text;
    if (ts.isMethodDeclaration(current) && ts.isIdentifier(current.name))
      return current.name.text;
    if (
      (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) &&
      current.parent &&
      ts.isVariableDeclaration(current.parent) &&
      ts.isIdentifier(current.parent.name)
    )
      return current.parent.name.text;
    if (
      ts.isPropertyAssignment(current) &&
      ts.isIdentifier(current.name) &&
      (ts.isArrowFunction(current.initializer) ||
        ts.isFunctionExpression(current.initializer))
    )
      return current.name.text;
    current = current.parent;
  }
  return '(module scope)';
}

function unwrapExpression(node: ts.Expression): ts.Expression {
  let current = node;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isTypeAssertionExpression(current)
  )
    current = current.expression;
  return current;
}

function insideFinallyBlock(node: ts.Node): boolean {
  let current: ts.Node | undefined = node;
  while (current) {
    if (
      current.parent &&
      ts.isTryStatement(current.parent) &&
      current.parent.finallyBlock === current
    )
      return true;
    current = current.parent;
  }
  return false;
}

export function scanFilesystemStores(options: {
  projectRoot: string;
  sourceRoots: string[];
  exclusions?: string[];
}): StoreScan {
  const projectRoot = path.resolve(options.projectRoot);
  const exclusions = [...(options.exclusions ?? [])].sort();
  const sourceRoots = [...options.sourceRoots].sort();

  const absolute: string[] = [];
  for (const root of sourceRoots)
    absolute.push(
      ...listFiles(path.resolve(projectRoot, root), projectRoot, exclusions),
    );
  const analyzedFiles = [...new Set(absolute)]
    .map((file) => path.relative(projectRoot, file))
    .sort((left, right) => left.localeCompare(right));

  const operations: FsOperation[] = [];
  const unresolved: UnresolvedFsUsage[] = [];
  const modules: ModuleSignals[] = [];
  const fingerprint = createHash('sha256');

  for (const relativeFile of analyzedFiles) {
    const absoluteFile = path.join(projectRoot, relativeFile);
    const text = readFileSync(absoluteFile, 'utf8');
    fingerprint.update(relativeFile);
    fingerprint.update('\0');
    fingerprint.update(createHash('sha256').update(text).digest('hex'));
    fingerprint.update('\n');

    const source = ts.createSourceFile(
      absoluteFile,
      text,
      ts.ScriptTarget.ESNext,
      true,
      absoluteFile.endsWith('.tsx')
        ? ts.ScriptKind.TSX
        : absoluteFile.endsWith('.mjs')
          ? ts.ScriptKind.JS
          : ts.ScriptKind.TS,
    );
    const diagnostics = (
      source as unknown as {
        parseDiagnostics?: Array<{ messageText: unknown }>;
      }
    ).parseDiagnostics;
    if (diagnostics?.length) {
      const first = diagnostics[0]?.messageText;
      const detail =
        typeof first === 'string'
          ? first
          : ts.flattenDiagnosticMessageText(
              first as ts.DiagnosticMessageChain | undefined,
              ' ',
            );
      throw new Error(
        `Failed to parse ${relativeFile}: ${detail || 'parse error'}`,
      );
    }

    const position = (node: ts.Node) => {
      const { line, character } = source.getLineAndCharacterOfPosition(
        node.getStart(source),
      );
      return { line: line + 1, column: character + 1 };
    };

    const fsBindings = new Map<string, string>();
    const namespaceBindings = new Set<string>();
    const trashBindings = new Set<string>();
    const signals: ModuleSignals = {
      file: relativeFile,
      importsAtomicStore: false,
      atomicStoreCalls: [],
      serializationKeys: [],
      temporaryNameConstructions: 0,
      exclusiveCreateCount: 0,
      renameCount: 0,
      gitInvocations: 0,
      symlinkChecks: 0,
      containmentChecks: 0,
      cleanupInFinally: 0,
      localWriteWrappers: [],
      multiWriteFunctions: [],
    };

    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement)) continue;
      const specifier = statement.moduleSpecifier;
      if (!ts.isStringLiteral(specifier)) continue;
      const clause = statement.importClause;
      if (!clause) continue;
      if (specifier.text.includes('atomic-json-store')) {
        signals.importsAtomicStore = true;
        continue;
      }
      if (specifier.text === 'trash') {
        if (clause.name) trashBindings.add(clause.name.text);
        continue;
      }
      if (!FS_MODULES.has(specifier.text)) continue;
      const bindings = clause.namedBindings;
      if (clause.name) namespaceBindings.add(clause.name.text);
      if (bindings && ts.isNamespaceImport(bindings))
        namespaceBindings.add(bindings.name.text);
      if (bindings && ts.isNamedImports(bindings))
        for (const element of bindings.elements) {
          if (element.isTypeOnly) continue;
          const original = (element.propertyName ?? element.name).text;
          fsBindings.set(element.name.text, original);
        }
    }

    const writesByFunction = new Map<string, number>();
    const localWrappers = new Set<string>();

    const recordOperation = (
      node: ts.CallExpression,
      method: string,
      callee: string,
      origin: FsOperation['origin'],
    ) => {
      const kind =
        origin === 'trash-package' ? 'trash' : KIND_BY_METHOD[method];
      if (!kind) return;
      const { line, column } = position(node);
      const enclosing = enclosingFunctionName(node);
      const exclusiveCreate = node.arguments.some(
        (argument) =>
          ts.isObjectLiteralExpression(argument) &&
          argument.properties.some(
            (property) =>
              ts.isPropertyAssignment(property) &&
              ts.isIdentifier(property.name) &&
              property.name.text === 'flag' &&
              ts.isStringLiteral(property.initializer) &&
              property.initializer.text === 'wx',
          ),
      );
      const insideFinally = insideFinallyBlock(node);
      operations.push({
        file: relativeFile,
        line,
        column,
        kind,
        callee,
        origin,
        exclusiveCreate,
        insideFinally,
        enclosingFunction: enclosing,
      });
      if (exclusiveCreate) signals.exclusiveCreateCount += 1;
      if (kind === 'rename') signals.renameCount += 1;
      if (insideFinally && WRITE_KINDS.has(kind)) signals.cleanupInFinally += 1;
      if (WRITE_KINDS.has(kind) && kind !== 'rename') {
        writesByFunction.set(
          enclosing,
          (writesByFunction.get(enclosing) ?? 0) + 1,
        );
        if (origin === 'node-fs' && enclosing !== '(module scope)')
          localWrappers.add(enclosing);
      }
    };

    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node)) {
        const expression = node.expression;
        if (ts.isIdentifier(expression)) {
          const original = fsBindings.get(expression.text);
          if (original)
            recordOperation(node, original, expression.text, 'node-fs');
          else if (trashBindings.has(expression.text))
            recordOperation(node, 'trash', expression.text, 'trash-package');
        } else if (ts.isPropertyAccessExpression(expression)) {
          const target = expression.expression;
          if (ts.isIdentifier(target) && namespaceBindings.has(target.text))
            recordOperation(
              node,
              expression.name.text,
              `${target.text}.${expression.name.text}`,
              'node-fs',
            );
        } else if (ts.isElementAccessExpression(expression)) {
          const target = unwrapExpression(expression.expression);
          if (
            ts.isIdentifier(target) &&
            (namespaceBindings.has(target.text) || fsBindings.has(target.text))
          ) {
            const { line, column } = position(node);
            unresolved.push({
              file: relativeFile,
              line,
              column,
              expression: expression.getText(source).slice(0, 80),
              reason: 'dynamic-member',
            });
          }
        }
      }

      if (
        ts.isTemplateExpression(node) &&
        /\.tmp/.test(node.getText(source)) &&
        /randomUUID|Date\.now|process\.pid/.test(node.getText(source))
      )
        signals.temporaryNameConstructions += 1;

      if (ts.isCallExpression(node)) {
        const first = node.arguments[0];
        if (first && ts.isStringLiteral(first) && first.text === 'git')
          signals.gitInvocations += 1;
      }

      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'isSymbolicLink'
      )
        signals.symlinkChecks += 1;

      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'startsWith' &&
        /root|Root|planningPath|boundary/.test(
          node.expression.expression.getText(source),
        )
      )
        signals.containmentChecks += 1;

      ts.forEachChild(node, visit);
    };
    visit(source);

    for (const statement of source.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      const declarationText = statement.getText(source);
      if (
        /Map<string,\s*Promise/.test(declarationText) ||
        /globalThis[\s\S]*Writes/.test(declarationText)
      ) {
        const name = statement.declarationList.declarations
          .map((declaration) => declaration.name.getText(source))
          .join(', ');
        signals.serializationKeys.push(name);
      }
    }

    signals.localWriteWrappers = [...localWrappers].sort();
    signals.multiWriteFunctions = [...writesByFunction.entries()]
      .filter(([, count]) => count > 1)
      .map(([name, writes]) => ({ name, writes }))
      .sort((left, right) => left.name.localeCompare(right.name));
    if (signals.importsAtomicStore)
      signals.atomicStoreCalls = [
        ...new Set(
          [
            ...text.matchAll(/\b(createJsonStore|writeFileAtomically)\s*\(/g),
          ].map((match) => match[1]!),
        ),
      ].sort();
    modules.push(signals);
  }

  operations.sort(
    (left, right) =>
      left.file.localeCompare(right.file) ||
      left.line - right.line ||
      left.column - right.column,
  );
  unresolved.sort(
    (left, right) =>
      left.file.localeCompare(right.file) || left.line - right.line,
  );
  modules.sort((left, right) => left.file.localeCompare(right.file));

  const omittedFilesystemFiles = detectOmittedFilesystemFiles(
    projectRoot,
    sourceRoots,
    exclusions,
    new Set(analyzedFiles),
  );

  return {
    inputFingerprint: fingerprint.digest('hex'),
    sourceRoots,
    exclusions,
    analyzedFiles,
    operations,
    unresolved,
    modules,
    omittedFilesystemFiles,
  };
}

function detectOmittedFilesystemFiles(
  projectRoot: string,
  sourceRoots: string[],
  exclusions: string[],
  analyzed: Set<string>,
): string[] {
  const omitted: string[] = [];
  const roots = ['app', 'bin', 'components', 'hooks', 'lib', 'scripts'];
  for (const root of roots) {
    const directory = path.resolve(projectRoot, root);
    if (!existsSync(directory)) continue;
    const walk = (current: string) => {
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        const relative = path.relative(projectRoot, full);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx|mts|mjs)$/.test(entry.name)) continue;
        if (analyzed.has(relative)) continue;
        const text = readFileSync(full, 'utf8');
        if (
          /from '(node:)?fs(\/promises)?'/.test(text) ||
          /require\(['"](node:)?fs/.test(text)
        )
          omitted.push(relative);
      }
    };
    walk(directory);
  }
  const covered = new Set(
    sourceRoots.flatMap((root) =>
      exclusions.filter((exclusion) => exclusion.startsWith(root)),
    ),
  );
  return omitted.filter((file) => !covered.has(file)).sort();
}
