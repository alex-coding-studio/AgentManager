import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { reserveNodeIdentity, type Scope } from '../identity-store.ts';
import { listTaskGraphNodes, type TaskGraphNode } from '../task/nodes.ts';
import { resolveCandidateDependencies } from './dependencies.ts';
import type { GraphCandidateInput } from './contract.ts';
import type { RegisteredProject } from '../../project-registry.ts';

export type PromoteCandidateInput = {
  scope: Scope;
  runPath: string;
  runId: string;
  candidate: GraphCandidateInput;
  existingNodes: TaskGraphNode[];
  extension?: Record<string, unknown>;
  provenanceFeature?: string;
};

export async function promoteCandidateToNode(
  project: RegisteredProject,
  input: PromoteCandidateInput,
) {
  const { scope, runId, candidate, existingNodes } = input;
  const resolvedDependencies = resolveCandidateDependencies(
    candidate.candidateId,
    candidate.dependsOn,
    existingNodes,
  );
  if (!candidate.uid) throw new Error('Candidate stable identity is missing.');
  const { id: nodeId } = await reserveNodeIdentity(
    project.planningPath,
    scope,
    candidate.uid,
  );
  const nodesPath = path.join(project.planningPath, scope, 'nodes');
  const nodePath = path.join(nodesPath, nodeId);
  const temporaryPath = path.join(nodesPath, `.${nodeId}-${randomUUID()}.tmp`);
  const candidateOutput = path.join(
    input.runPath,
    'candidates',
    candidate.candidateId,
    'output.md',
  );
  await mkdir(temporaryPath, { recursive: true });

  try {
    await copyFile(candidateOutput, path.join(temporaryPath, 'output.md'));
    const timestamp = new Date().toISOString();
    const matchingType = existingNodes.find(
      (node) => node.type === candidate.type,
    );
    const node = {
      schemaVersion: 1,
      id: nodeId,
      uid: candidate.uid,
      relations: candidate.relations,
      role: 'node',
      type: candidate.type,
      ...input.extension,
      title: candidate.title,
      summary: candidate.summary,
      status: 'accepted',
      createdAt: timestamp,
      updatedAt: timestamp,
      resources: [
        ...candidate.resources,
        { kind: 'output', path: `${scope}/nodes/${nodeId}/output.md` },
      ],
      derivedFrom: candidate.derivedFrom,
      dependsOn: resolvedDependencies,
      typeTemplateRef:
        candidate.typeTemplateRef ??
        matchingType?.typeTemplateRef ??
        matchingType?.id ??
        nodeId,
      metadata: candidate.metadata,
      presentation: candidate.presentation,
      provenance: {
        ...(input.provenanceFeature && {
          feature: input.provenanceFeature,
        }),
        runId,
        candidateId: candidate.candidateId,
        revision: candidate.revision,
      },
    } as TaskGraphNode;
    await writeFile(
      path.join(temporaryPath, 'node.json'),
      `${JSON.stringify(node, null, 2)}\n`,
      { flag: 'wx' },
    );
    await mkdir(nodesPath, { recursive: true });
    await rename(temporaryPath, nodePath);
    return { node, nodes: await listTaskGraphNodes(project, scope) };
  } catch (error) {
    await rm(temporaryPath, { recursive: true, force: true });
    throw error;
  }
}
