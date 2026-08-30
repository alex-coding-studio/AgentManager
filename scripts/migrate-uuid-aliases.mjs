import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  writeFile,
  lstat,
} from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { bindIdentity, uuidAlias } from '../lib/graph-identity.ts';

export async function migrateUuidAliases(
  planningPath,
  backupPath,
  apply = false,
) {
  planningPath = await import('node:fs/promises').then((fs) =>
    fs.realpath(planningPath),
  );
  backupPath = path.resolve(backupPath);
  if (
    backupPath === planningPath ||
    backupPath.startsWith(`${planningPath}${path.sep}`)
  )
    throw new Error('Backup must be outside the planning directory.');
  const plans = [];
  for (const scope of ['task-graph', 'whats-next']) {
    const indexFile = path.join(planningPath, scope, 'identities.json');
    let prior;
    try {
      prior = JSON.parse(await readFile(indexFile, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    const index = { schemaVersion: 1, aliases: {}, formalAliases: [] };
    const aliases = {};
    for (const [old, uid] of Object.entries(prior.aliases)) {
      const prefix = old.startsWith('NODE-')
        ? 'NODE'
        : old.startsWith('CANDIDATE-')
          ? 'CANDIDATE'
          : null;
      if (!prefix) throw new Error(`Invalid alias: ${old}`);
      const alias = uuidAlias(index, prefix, uid);
      bindIdentity(index, alias, uid);
      aliases[old] = alias;
    }
    index.formalAliases = prior.formalAliases.map((old) => aliases[old]);
    if (index.formalAliases.some((alias) => !alias))
      throw new Error('Unresolved formal alias.');
    plans.push({ scope, aliases, index });
  }
  const report = plans.map(({ scope, aliases }) => ({ scope, aliases }));
  if (!apply) return report;
  for (const { scope } of plans) {
    const runsPath = path.join(
      planningPath,
      scope === 'task-graph' ? 'task-decomposition' : scope,
      'runs',
    );
    for (const dir of await readdir(runsPath).catch((e) => {
      if (e.code === 'ENOENT') return [];
      throw e;
    })) {
      const record = JSON.parse(
        await readFile(path.join(runsPath, dir, 'run.json'), 'utf8'),
      );
      if (['running', 'validating'].includes(record.status))
        throw new Error(`Stop active Run ${dir} before migration.`);
    }
  }
  await mkdir(backupPath, { recursive: false });
  await cp(planningPath, path.join(backupPath, 'original'), {
    recursive: true,
    errorOnExist: true,
    force: false,
  });
  await writeFile(
    path.join(backupPath, 'aliases.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  const stage = await mkdtemp(
    path.join(path.dirname(planningPath), '.uuid-migration-'),
  );
  const folders = [
    ...new Set(
      plans.flatMap(({ scope }) =>
        scope === 'task-graph' ? [scope, 'task-decomposition'] : [scope],
      ),
    ),
  ];
  const present = [];
  for (const folder of folders) {
    const source = path.join(planningPath, folder);
    try {
      await lstat(source);
    } catch (e) {
      if (e.code === 'ENOENT') continue;
      throw e;
    }
    await cp(source, path.join(stage, folder), { recursive: true });
    present.push(folder);
  }
  for (const plan of plans) {
    const replace = (text) => {
      const protectedPaths = [];
      let value = text.replace(
        /(task-graph|whats-next)\/nodes\/(NODE-[0-9a-f]+)(?=\/|\b)/g,
        (match, scope, alias) => {
          const mapped = plans.find((p) => p.scope === scope)?.aliases[alias];
          if (!mapped) return match;
          protectedPaths.push(`${scope}/nodes/${mapped}`);
          return `\u0000PATH${protectedPaths.length - 1}\u0000`;
        },
      );
      value = value.replace(
        /\b(?:NODE|CANDIDATE)-[0-9a-f]+\b/g,
        (alias) => plan.aliases[alias] ?? alias,
      );
      return value.replace(
        /\u0000PATH(\d+)\u0000/g,
        (_, i) => protectedPaths[Number(i)],
      );
    };
    const transform = (value) =>
      typeof value === 'string'
        ? replace(value)
        : Array.isArray(value)
          ? value.map(transform)
          : value && typeof value === 'object'
            ? Object.fromEntries(
                Object.entries(value).map(([k, v]) => [
                  replace(k),
                  transform(v),
                ]),
              )
            : value;
    async function visit(directory) {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (
          entry.name === 'identity-migration-backup' ||
          entry.name === 'identities.json'
        )
          continue;
        const source = path.join(directory, entry.name);
        if (entry.isSymbolicLink())
          throw new Error(`Migration does not follow symlinks: ${source}`);
        if (entry.isDirectory()) await visit(source);
        else if (
          entry.name !== 'request.json' &&
          /\.(json|md|markdown)$/.test(entry.name)
        ) {
          const text = await readFile(source, 'utf8');
          let output;
          if (entry.name.endsWith('.json')) {
            const value = transform(JSON.parse(text));
            if (entry.name === 'run.json') delete value.agentSessionMode;
            output = `${JSON.stringify(value, null, 2)}\n`;
          } else output = replace(text);
          if (output !== text) await writeFile(source, output);
        }
        const next = replace(entry.name);
        if (next !== entry.name) {
          const target = path.join(directory, next);
          try {
            await lstat(target);
            throw new Error(`Migration target already exists: ${target}`);
          } catch (e) {
            if (e.code !== 'ENOENT') throw e;
          }
          await rename(source, target);
        }
      }
    }
    for (const folder of plan.scope === 'task-graph'
      ? ['task-graph', 'task-decomposition']
      : ['whats-next']) {
      if (present.includes(folder)) await visit(path.join(stage, folder));
    }
    await writeFile(
      path.join(stage, plan.scope, 'identities.json'),
      `${JSON.stringify(plan.index, null, 2)}\n`,
    );
  }
  await mkdir(path.join(backupPath, 'replaced'));
  for (const folder of present) {
    await rename(
      path.join(planningPath, folder),
      path.join(backupPath, 'replaced', folder),
    );
    await rename(path.join(stage, folder), path.join(planningPath, folder));
  }
  return { backupPath, mappings: report };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const [planningPath, backupPath, flag] = process.argv.slice(2);
  if (!planningPath || !backupPath)
    throw new Error(
      'Usage: node --experimental-strip-types scripts/migrate-uuid-aliases.mjs <planning-path> <new-backup-path> [--apply]. Stop the application server before --apply.',
    );
  console.log(
    JSON.stringify(
      await migrateUuidAliases(planningPath, backupPath, flag === '--apply'),
      null,
      2,
    ),
  );
}
