'use client';

import { useUiText } from '@/components/ui-language-provider';

export function AgentGraphIntentionSelect<Id extends string>({
  profiles,
  value,
  onChange,
  label = 'Intention',
  disabled = false,
  showDescription = true,
}: {
  profiles: readonly { id: Id; label: string; description: string }[];
  value: Id;
  onChange: (value: Id) => void;
  label?: string;
  disabled?: boolean;
  showDescription?: boolean;
}) {
  const { t } = useUiText();
  const selected = profiles.find((profile) => profile.id === value);
  return (
    <label className="block text-[10px] font-medium text-muted-foreground">
      {t(label)}
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as Id)}
        className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs font-medium text-foreground outline-none transition focus:border-ring focus:ring-3 focus:ring-ring/20"
      >
        {profiles.map((profile) => (
          <option key={profile.id} value={profile.id}>
            {t(profile.label)}
          </option>
        ))}
      </select>
      {selected && showDescription ? (
        <span className="mt-1.5 block text-[10px] font-normal leading-4 text-muted-foreground">
          {t(selected.description)}
        </span>
      ) : null}
    </label>
  );
}
