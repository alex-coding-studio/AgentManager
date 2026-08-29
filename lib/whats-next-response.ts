import type { WhatsNextHarnessResult } from '@/lib/whats-next-harness';

export function renderWhatsNextResponseMarkdown(
  result: WhatsNextHarnessResult,
) {
  const reflection = result.reflection.markdown.trim();
  if (result.outcome === 'proposal') {
    const candidates = result.candidates
      .map((candidate) => demoteHeadings(candidate.outputMarkdown.trim()))
      .join('\n\n---\n\n');
    return `${reflection}

# Candidate Proposals

${candidates}
`;
  }
  if (result.outcome === 'clarification') {
    const options = result.clarification.options
      .map(
        (option) =>
          `- **${option.label}**${option.recommended ? ' — Recommended' : ''}: ${option.effect}`,
      )
      .join('\n');
    return `${reflection}

# Clarification

${result.clarification.question}

${options}
`;
  }
  return `${reflection}

# No further direction

${result.reason}
`;
}

function demoteHeadings(markdown: string) {
  return markdown.replace(/^(#{1,5})\s/gm, '#$1 ');
}
