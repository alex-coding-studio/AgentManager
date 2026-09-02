export function titleFromAgentGraphIdea(idea: string) {
  const firstLine = idea
    .split('\n')
    .map((line) => line.replace(/^#+\s*/, '').trim())
    .find(Boolean);
  return (firstLine || 'Untitled idea').slice(0, 160);
}
