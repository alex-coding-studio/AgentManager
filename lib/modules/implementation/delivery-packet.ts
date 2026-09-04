import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  buildPacketManifest,
  packetAmendments,
  renderTemplate,
  verifyPacket,
  PACKET_ENTRIES,
  PACKET_DIRECTORIES,
  PACKET_SPEC,
  type PacketManifestInput,
  type PacketProducer,
  type PacketFileSpecEntry,
} from './delivery-packet-manifest.ts';
import {
  executionResponsibilityInstructions,
  executionResponsibilityReference,
  executionResponsibilitySource,
  resolveExecutionResponsibilities,
  type ExecutionResponsibility,
} from './execution-responsibilities.ts';
import {
  JUST_DO_IT_BUILT_IN_INSTRUCTIONS,
  JUST_DO_IT_EXECUTION_INSTRUCTIONS,
  JUST_DO_IT_OUTPUT_SCHEMA,
  type CardHarnessRequest,
} from './harness.ts';
import type { CoordinationDecision, PriorEvidence } from './coordination.ts';
import type { CardEnvironmentManifest } from '../../card-host-operations.ts';

type PacketContents = Partial<
  Record<(typeof PACKET_ENTRIES)[number]['id'], string>
>;

export type DeliveryPacketMaterializeInput = {
  packetDir: string;
  manifest: PacketManifestInput;
  host: PacketContents;
  coordinator: PacketContents;
  responsibilities: ExecutionResponsibility[];
};

export type DeliveryPacketMaterialization = {
  packetDir: string;
  manifestPath: string;
  createdFiles: string[];
  amendmentFiles: string[];
};

export type DeliveryPacketHandoffInput = {
  packetDir: string;
  request: CardHarnessRequest;
  decision: CoordinationDecision;
  environment?: CardEnvironmentManifest;
  selectedSkills: Array<{ name: string; path: string }>;
  priorEvidence: PriorEvidence[];
  runtimeInstructions: string;
};

const entryById = new Map(PACKET_ENTRIES.map((entry) => [entry.id, entry]));

async function regularDirectory(directory: string) {
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error('Delivery packet path is not a regular directory.');
}

async function copyPacket(source: string, destination: string) {
  await regularDirectory(source);
  for (const item of await readdir(source, { withFileTypes: true })) {
    if (item.isFile() && !item.isSymbolicLink()) {
      await copyFile(
        path.join(source, item.name),
        path.join(destination, item.name),
      );
      continue;
    }
    if (
      !item.isDirectory() ||
      item.isSymbolicLink() ||
      !PACKET_DIRECTORIES.includes(item.name)
    )
      throw new Error(`Invalid delivery packet entry: ${item.name}`);
    const sourceDirectory = path.join(source, item.name);
    const destinationDirectory = path.join(destination, item.name);
    await mkdir(destinationDirectory);
    for (const child of await readdir(sourceDirectory, {
      withFileTypes: true,
    })) {
      if (!child.isFile() || child.isSymbolicLink())
        throw new Error(
          `Invalid delivery packet entry: ${item.name}/${child.name}`,
        );
      await copyFile(
        path.join(sourceDirectory, child.name),
        path.join(destinationDirectory, child.name),
      );
    }
  }
}

async function packetPaths(directory: string) {
  const paths = new Set<string>();
  for (const item of await readdir(directory, { withFileTypes: true })) {
    if (item.isFile()) {
      paths.add(item.name);
      continue;
    }
    if (!item.isDirectory() || !PACKET_DIRECTORIES.includes(item.name))
      continue;
    for (const child of await readdir(path.join(directory, item.name)))
      paths.add(`${item.name}/${child}`);
  }
  return paths;
}

async function appendResponsibilities(
  packetDir: string,
  selected: ExecutionResponsibility[],
) {
  const directory = path.join(packetDir, 'Responsibilities');
  await mkdir(directory, { recursive: true });
  const files = (await readdir(directory)).sort((left, right) => {
    const sequence = (file: string) =>
      Number(/^Responsibility-(\d+)\.json$/.exec(file)?.[1] ?? 0);
    return sequence(left) - sequence(right);
  });
  const assigned = new Set<ExecutionResponsibility>();
  for (const [index, file] of files.entries()) {
    if (file !== `Responsibility-${index + 1}.json`)
      throw new Error('Delivery packet responsibility sequence is invalid.');
    const pointer = JSON.parse(
      await readFile(path.join(directory, file), 'utf8'),
    ) as { id?: unknown; source?: unknown };
    if (
      typeof pointer.id !== 'string' ||
      !resolveExecutionResponsibilities([pointer.id]).includes(pointer.id)
    )
      throw new Error(`Invalid delivery packet responsibility: ${file}`);
    const responsibility = pointer.id as ExecutionResponsibility;
    const expectedSource = executionResponsibilitySource(responsibility);
    const logicalSource =
      pointer.source === executionResponsibilityReference(responsibility);
    const equivalentLegacySource =
      !logicalSource &&
      typeof pointer.source === 'string' &&
      path.isAbsolute(pointer.source) &&
      (await lstat(pointer.source)
        .then(
          (stat) =>
            stat.isFile() && !stat.isSymbolicLink() && stat.size <= 2097152,
        )
        .catch(() => false))
        ? await Promise.all([
            readFile(pointer.source, 'utf8'),
            readFile(expectedSource, 'utf8'),
          ])
            .then(([actual, expected]) => actual === expected)
            .catch(() => false)
        : false;
    if (
      typeof pointer.id !== 'string' ||
      !resolveExecutionResponsibilities([pointer.id]).includes(
        responsibility,
      ) ||
      (!logicalSource && !equivalentLegacySource) ||
      assigned.has(responsibility)
    )
      throw new Error(`Invalid delivery packet responsibility: ${file}`);
    assigned.add(responsibility);
  }
  executionResponsibilityInstructions([...assigned, ...selected]);
  const created: string[] = [];
  for (const responsibility of resolveExecutionResponsibilities([
    ...assigned,
    ...selected,
  ])) {
    if (assigned.has(responsibility)) continue;
    const file = `Responsibility-${files.length + created.length + 1}.json`;
    await writeFile(
      path.join(directory, file),
      `${JSON.stringify(
        {
          id: responsibility,
          source: executionResponsibilityReference(responsibility),
        },
        null,
        2,
      )}\n`,
      { flag: 'wx' },
    );
    created.push(`Responsibilities/${file}`);
    assigned.add(responsibility);
  }
  return created;
}

export async function packetResponsibilityState(packetDir: string) {
  const directory = path.join(packetDir, 'Responsibilities');
  const files = await readdir(directory).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    },
  );
  const entries = await Promise.all(
    files
      .filter((file) => /^Responsibility-[1-9]\d*\.json$/.test(file))
      .map(async (file) => {
        const pointer = JSON.parse(
          await readFile(path.join(directory, file), 'utf8'),
        ) as { id: string };
        return { file: `Responsibilities/${file}`, id: pointer.id };
      }),
  );
  entries.sort(
    (a, b) =>
      Number(a.file.match(/-(\d+)\.json$/)?.[1]) -
      Number(b.file.match(/-(\d+)\.json$/)?.[1]),
  );
  const ids = entries.length
    ? resolveExecutionResponsibilities(entries.map((entry) => entry.id))
    : [];
  return {
    ids,
    files: entries
      .filter((entry) => ids.includes(entry.id))
      .map((entry) => entry.file),
  };
}

function validateContents(contents: PacketContents, producer: PacketProducer) {
  for (const [id, content] of Object.entries(contents)) {
    const entry = entryById.get(id);
    if (!entry || entry.producer !== producer)
      throw new Error(`Invalid ${producer} delivery packet entry: ${id}`);
    if (
      typeof content !== 'string' ||
      !content.trim() ||
      Buffer.byteLength(content) > 2_097_152
    )
      throw new Error(`Invalid delivery packet content: ${id}`);
  }
}

function amendmentFile(sequence: number, targetFile: string) {
  return `Amendment-${sequence}-${targetFile}`;
}

export async function materializeDeliveryPacket(
  input: DeliveryPacketMaterializeInput,
): Promise<DeliveryPacketMaterialization> {
  if (!path.isAbsolute(input.packetDir))
    throw new Error('Delivery packet path must be absolute.');
  validateContents(input.host, 'host');
  validateContents(input.coordinator, 'coordinator');
  const contents = { ...input.host, ...input.coordinator };
  const parent = path.dirname(input.packetDir);
  await mkdir(parent, { recursive: true });
  await regularDirectory(parent);
  const pending = `${input.packetDir}.pending-${randomUUID()}`;
  const backup = `${input.packetDir}.backup-${randomUUID()}`;
  await mkdir(pending);
  let existing = true;
  try {
    await copyPacket(input.packetDir, pending);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    existing = false;
  }
  const createdFiles: string[] = [];
  const amendmentFiles: string[] = [];
  try {
    createdFiles.push(
      ...(await appendResponsibilities(pending, input.responsibilities)),
    );
    const present = await packetPaths(pending);
    for (const entry of PACKET_ENTRIES) {
      const content = contents[entry.id];
      if (content === undefined) continue;
      const amendments = packetAmendments(present).filter(
        (amendment) => amendment.targetId === entry.id,
      );
      const currentFile = amendments.at(-1)?.file ?? entry.file;
      if (!present.has(entry.file)) {
        await writeFile(path.join(pending, entry.file), content, {
          flag: 'wx',
        });
        present.add(entry.file);
        createdFiles.push(entry.file);
        continue;
      }
      const currentDocument = await readFile(
        path.join(pending, currentFile),
        'utf8',
      );
      const currentContent = amendments.length
        ? amendmentBody(currentDocument)
        : currentDocument;
      if (currentContent.trimEnd() === content.trimEnd()) continue;
      const nextSequence = (amendments.at(-1)?.sequence ?? 0) + 1;
      const file = amendmentFile(nextSequence, entry.file);
      await writeFile(
        path.join(pending, file),
        amendmentDocument(entry, nextSequence, content),
        { flag: 'wx' },
      );
      present.add(file);
      createdFiles.push(file);
      amendmentFiles.push(file);
    }
    const active = await packetResponsibilityState(pending);
    const manifest = buildPacketManifest(
      { ...input.manifest, activeResponsibilityFiles: active.files },
      PACKET_SPEC,
      present,
    );
    await writeFile(path.join(pending, PACKET_SPEC.manifestFile), manifest);
    present.add(PACKET_SPEC.manifestFile);
    const verification = await verifyPacket(pending);
    const missingOrigin = verification.missing.filter((missing) =>
      PACKET_SPEC.origin.some((entry) => entry.id === missing.id),
    );
    if (missingOrigin.length || verification.unexpectedFiles.length)
      throw new Error(
        `Delivery packet is incomplete: ${JSON.stringify({ missing: missingOrigin, unexpectedFiles: verification.unexpectedFiles })}`,
      );
    if (existing) await rename(input.packetDir, backup);
    try {
      await rename(pending, input.packetDir);
    } catch (error) {
      if (existing)
        await rename(backup, input.packetDir).catch(() => undefined);
      throw error;
    }
    if (existing) await rm(backup, { recursive: true, force: true });
    return {
      packetDir: input.packetDir,
      manifestPath: path.join(input.packetDir, PACKET_SPEC.manifestFile),
      createdFiles,
      amendmentFiles,
    };
  } finally {
    await rm(pending, { recursive: true, force: true });
  }
}

const PACKET_TEMPLATE_ROOT = path.join(
  process.cwd(),
  'lib/templates/delivery-packet',
);

const jsonBlock = (value: unknown) =>
  `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;

function packetTemplate(name: string, values: Record<string, string>) {
  return renderTemplate(
    readFileSync(path.join(PACKET_TEMPLATE_ROOT, `${name}.md`), 'utf8'),
    values,
  );
}

function amendmentDocument(
  entry: PacketFileSpecEntry,
  sequence: number,
  content: string,
) {
  return packetTemplate('amendment', {
    targetFile: entry.file,
    sequence: String(sequence),
    content,
  });
}

function amendmentBody(document: string) {
  const marker = '\n## Content\n\n';
  const index = document.indexOf(marker);
  if (index < 0) throw new Error('Invalid delivery packet amendment content.');
  return document.slice(index + marker.length);
}

export function deliveryPacketContents(input: {
  request: CardHarnessRequest;
  decision: CoordinationDecision;
  environment?: CardEnvironmentManifest;
  selectedSkills: Array<{ name: string; path: string }>;
  priorEvidence: PriorEvidence[];
  runtimeInstructions: string;
}) {
  const { request, decision } = input;
  const executionSchema = {
    $schema: JUST_DO_IT_OUTPUT_SCHEMA.$schema,
    ...JUST_DO_IT_OUTPUT_SCHEMA.oneOf[1],
  };
  const productContext = request.context.resources.filter((resource) =>
    resource.description.includes('Product Context'),
  );
  return {
    host: {
      environment: packetTemplate('environment', {
        environment: jsonBlock(
          input.environment ?? { status: 'not-applicable' },
        ),
        runtimeInstructions: input.runtimeInstructions,
      }),
      'user-input': packetTemplate('user-input', {
        goal: request.context.goal,
        userInput: request.userInput,
      }),
      resources: packetTemplate('resources', {
        resources: jsonBlock(request.context.resources),
      }),
      acceptance: packetTemplate('acceptance', {
        builtInInstructions: JUST_DO_IT_BUILT_IN_INSTRUCTIONS,
        executionInstructions: JUST_DO_IT_EXECUTION_INSTRUCTIONS,
        checklistVersion:
          request.context.acceptanceChecklist?.version ?? 'none',
        acceptance: jsonBlock({
          checklist: request.context.acceptanceChecklist,
          responseSchema: executionSchema,
        }),
      }),
      'product-context': packetTemplate('product-context', {
        productContext: jsonBlock(
          productContext.length ? productContext : { status: 'none' },
        ),
      }),
    },
    coordinator: {
      assignment: packetTemplate('assignment', {
        moduleInstructions: request.context.moduleInstructions || 'None.',
        summary: decision.summary,
        instructions: decision.instructions,
        action: jsonBlock(
          request.context.plan?.steps.find(
            (action) => action.id === request.actionId,
          ) ?? { status: 'missing' },
        ),
        responseIdentity: jsonBlock({
          harnessRevision: request.harnessRevision,
          requestId: request.requestId,
          cardId: request.context.cardId,
          contextRevision: request.context.contextRevision,
          inputFingerprint: request.inputFingerprint,
          actionId: request.actionId,
        }),
        acceptanceOverrides: jsonBlock(
          request.context.acceptanceOverrides ?? {},
        ),
        currentOutput: jsonBlock(
          request.context.currentOutput ?? { status: 'none' },
        ),
        scopeNotes: jsonBlock(decision.scopeNotes),
        repairAssessment: decision.repairAssessment
          ? jsonBlock(decision.repairAssessment)
          : 'None.',
      }),
      skills: packetTemplate('skills', {
        skills: jsonBlock(input.selectedSkills),
      }),
      'verification-plan': packetTemplate('verification-plan', {
        verificationPlan: jsonBlock({
          plan: decision.verificationPlan,
          currentOutput: request.context.currentOutput ?? null,
          priorEvidence: input.priorEvidence.filter((evidence) =>
            decision.verificationPlan.some((plan) =>
              plan.evidenceIds.includes(evidence.id),
            ),
          ),
        }),
      }),
    },
  } satisfies Pick<DeliveryPacketMaterializeInput, 'host' | 'coordinator'>;
}

export function handoffDeliveryPacket(input: DeliveryPacketHandoffInput) {
  return materializeDeliveryPacket({
    packetDir: input.packetDir,
    manifest: {
      cardId: input.request.context.cardId,
      actionId: input.request.actionId!,
      contextRevision: input.request.context.contextRevision,
    },
    responsibilities: input.decision.responsibilities,
    ...deliveryPacketContents(input),
  });
}

const MATERIALIZER_SCRIPT = path.join(
  process.cwd(),
  'scripts/handoff-execution-packet.ts',
);

export function runDeliveryPacketScript(input: DeliveryPacketHandoffInput) {
  return new Promise<DeliveryPacketMaterialization>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--experimental-strip-types', MATERIALIZER_SCRIPT],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let stdout = '';
    let stderr = '';
    let bytes = 0;
    let settled = false;
    const finish = (error?: Error, result?: DeliveryPacketMaterialization) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(result!);
    };
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      finish(new Error('Delivery packet materializer timed out.'));
    }, 30_000);
    timer.unref();
    child.on('error', () =>
      finish(new Error('Could not start delivery packet materializer.')),
    );
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > 1_000_000) {
        child.kill('SIGTERM');
        finish(new Error('Delivery packet materializer output is too large.'));
        return;
      }
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-16_000);
    });
    child.on('close', (code) => {
      if (settled) return;
      if (code !== 0)
        return finish(
          new Error(
            stderr.trim() || `Delivery packet materializer exited ${code}.`,
          ),
        );
      try {
        const result = JSON.parse(stdout) as DeliveryPacketMaterialization;
        if (
          result.packetDir !== input.packetDir ||
          result.manifestPath !==
            path.join(input.packetDir, PACKET_SPEC.manifestFile) ||
          !Array.isArray(result.createdFiles) ||
          !Array.isArray(result.amendmentFiles)
        )
          throw new Error(
            'Delivery packet materializer returned another packet.',
          );
        finish(undefined, result);
      } catch (error) {
        finish(
          error instanceof Error
            ? error
            : new Error('Invalid delivery packet materializer output.'),
        );
      }
    });
    child.stdin.on('error', () => undefined);
    child.stdin.end(JSON.stringify(input));
  });
}

export function workerPacketPrompt(manifestPath: string) {
  return `Read ${manifestPath}; follow Origin order and its exact-filename skip rule. Resolve all Responsibility pointers by id under ${path.dirname(executionResponsibilitySource('general'))}/<id>.json, ignoring legacy source paths. Execute the finalized Action; return required JSON.`;
}
