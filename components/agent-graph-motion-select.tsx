'use client';

import { useUiText } from '@/components/ui-language-provider';

export function AgentGraphMotionSelect<Id extends string>({
  profiles,
  value,
  onChange,
  label = 'Motion',
  disabled = false,
}: {
  profiles: readonly { id: Id; label: string }[];
  value: Id;
  onChange: (value: Id) => void;
  label?: string;
  disabled?: boolean;
}) {
  const { t } = useUiText();
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
    </label>
  );
}
