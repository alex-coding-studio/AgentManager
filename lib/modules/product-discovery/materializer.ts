import {
  validateGraphProposal,
  type GraphProposalDependencyState,
} from '../../graph/proposal/validate.ts';
import { MaterializationError } from '../../materialization/receipt.ts';
import type { ProductExplorationOperation } from './basis.ts';
import type {
  ProductExplorationCandidate,
  ProductExplorationResult,
} from './contract.ts';
import {
  intentionDestination,
  type WhatsNextIntention,
  type WhatsNextMotion,
} from './intention.ts';

export type ProductExplorationValidationState = GraphProposalDependencyState & {
  operation: ProductExplorationOperation;
  intention: WhatsNextIntention;
  motion: WhatsNextMotion;
  productSourceNodeId: string | null;
  revisionSource: ProductExplorationCandidate | null;
};

function fail(message: string): never {
  throw new MaterializationError('validation', message);
}

function validateOperationCardinality(
  state: ProductExplorationValidationState,
  candidates: ProductExplorationCandidate[],
) {
  if (state.operation === 'explore') {
    if (state.motion === 'converge' && candidates.length !== 1)
      fail('Converge must return exactly one aggregate Candidate.');
    if (
      state.motion === 'diverge' &&
      (candidates.length < 2 || candidates.length > 5)
    )
      fail("A What's Next divergence must return two to five directions.");
    return;
  }
  const { revisionTarget, revisionSource } = state;
  if (!revisionTarget || !revisionSource)
    fail('Refine requires the Candidate being revised.');
  if (revisionSource.localKey !== revisionTarget.candidateId)
    fail('The Candidate being revised does not match the refine request.');
  const [candidate] = candidates;
  if (
    candidates.length !== 1 ||
    candidate?.localKey !== revisionTarget.candidateId
  )
    fail('Refine must return exactly the requested Candidate identifier.');
  validateRefineBoundary(candidate, revisionSource);
}

function validateRefineBoundary(
  candidate: ProductExplorationCandidate,
  previous: ProductExplorationCandidate,
) {
  const unchanged = [
    ['type', candidate.type, previous.type],
    ['derivedFrom', candidate.derivedFrom, previous.derivedFrom],
    ['dependsOn', candidate.dependsOn, previous.dependsOn],
    ['layer', candidate.layer, previous.layer],
    ['artifactKind', candidate.artifactKind, previous.artifactKind],
    ['resources', candidate.resources, previous.resources],
    ['typeTemplateRef', candidate.typeTemplateRef, previous.typeTemplateRef],
    ['metadata', candidate.metadata, previous.metadata],
    ['presentation', candidate.presentation, previous.presentation],
  ] as const;
  for (const [field, current, prior] of unchanged) {
    if (JSON.stringify(current) !== JSON.stringify(prior))
      fail(`Refine cannot change Candidate ${field}.`);
  }
}

function validateCandidateMarkdown(candidate: ProductExplorationCandidate) {
  const markdown = candidate.outputMarkdown.trim();
  if (!markdown.startsWith(`# ${candidate.title}\n`))
    fail('Candidate Markdown must start with its exact title.');
  const rationale = markdown.match(
    /(?:^|\n)## Why this direction\s*\n([\s\S]*?)(?=\n## |$)/,
  )?.[1];
  if (!rationale)
    fail('Candidate Markdown must contain a Why this direction section.');
  const statements = rationale
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^(?:[-*]|\d+[.)])\s+/.test(line));
  if (statements.length < 2 || statements.length > 4)
    fail('Why this direction must contain two to four short bullets.');
  if (statements.some((statement) => statement.length > 242))
    fail('Each Why this direction bullet must remain concise.');
  const assumptionsSection = markdown.match(
    /(?:^|\n)## Assumptions\s*\n([\s\S]*?)(?=\n## |$)/,
  )?.[1];
  if (!assumptionsSection)
    fail('Candidate Markdown must contain an Assumptions section.');
  const markdownAssumptions = assumptionsSection
    .split('\n')
    .map((line) => line.trim().replace(/^[-*]\s+/, ''))
    .filter((line) => line && line.toLowerCase() !== 'none');
  if (
    JSON.stringify(markdownAssumptions) !==
    JSON.stringify(candidate.assumptions)
  ) {
    fail('Candidate assumptions must mirror its Markdown section.');
  }
}

function validateIntentionDestination(
  state: ProductExplorationValidationState,
  candidate: ProductExplorationCandidate,
) {
  const destination = intentionDestination(state.intention);
  if (
    candidate.layer !== destination.layer ||
    candidate.artifactKind !== destination.artifactKind
  ) {
    fail('A Candidate does not match the requested Intention destination.');
  }
}

function validateProductDesignLineage(
  state: ProductExplorationValidationState,
  candidate: ProductExplorationCandidate,
) {
  if (
    state.intention !== 'product-design-completion' ||
    state.operation !== 'explore' ||
    !state.productSourceNodeId
  ) {
    return;
  }
  if (
    candidate.derivedFrom.length !== 1 ||
    candidate.derivedFrom[0]?.id !== state.productSourceNodeId
  ) {
    fail(
      'Product Design Completion must keep the Product Source as its only lineage parent.',
    );
  }
}

export function validateProductExplorationResult(
  state: ProductExplorationValidationState,
  result: ProductExplorationResult,
) {
  if (result.outcome !== 'proposal') return;
  validateGraphProposal(state, result.candidates);
  validateOperationCardinality(state, result.candidates);
  for (const candidate of result.candidates) {
    validateCandidateMarkdown(candidate);
    validateIntentionDestination(state, candidate);
    validateProductDesignLineage(state, candidate);
  }
}
