'use client';

import { ChevronDown } from 'lucide-react';
import type { LocalAgentKind } from '@/lib/local-agent-transport';
import { cn } from '@/lib/utils';

const labels: Record<LocalAgentKind, string> = {
  codex: 'Codex',
  claude: 'Claude',
};

export function AgentToggle({
  value,
  onChange,
}: {
  value: LocalAgentKind;
  onChange: (agent: LocalAgentKind) => void;
}) {
  return (
    <fieldset
      className="flex rounded-lg border border-border p-0.5"
      aria-label="Agent"
    >
      {(['claude', 'codex'] as LocalAgentKind[]).map((agent) => (
        <button
          key={agent}
          type="button"
          onClick={() => onChange(agent)}
          className={cn(
            'rounded-[7px] px-2.5 py-1 text-[11px] transition',
            value === agent
              ? 'bg-foreground text-background'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {labels[agent]}
        </button>
      ))}
    </fieldset>
  );
}

export function AgentSelectField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: LocalAgentKind;
  onChange: (agent: LocalAgentKind) => void;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-xs font-medium">
        Agent
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value as LocalAgentKind)}
          className="h-10 w-full appearance-none rounded-xl border border-border bg-background px-3 pr-9 text-xs font-medium outline-none transition focus:border-ring focus:ring-3 focus:ring-ring/20"
        >
          <option value="codex">Codex</option>
          <option value="claude">Claude</option>
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
      </div>
    </div>
  );
}
