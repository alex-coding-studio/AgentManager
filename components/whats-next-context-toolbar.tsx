'use client';

import { ModuleInstructionsDialog } from '@/components/module-instructions-dialog';
import { ProjectModuleHeader } from '@/components/project-module-header';
import { useUiText } from '@/components/ui-language-provider';

export function WhatsNextContextToolbar({
  projectId,
  disabled = false,
}: {
  projectId: string;
  disabled?: boolean;
}) {
  const { t } = useUiText();
  return (
    <ProjectModuleHeader
      title={t('Product Discovery & Design')}
      description={t('Explore the next supported product direction.')}
      actions={
        <ModuleInstructionsDialog
          endpoint={`/api/projects/${projectId}/whats-next-context`}
          title="Product Discovery & Design instructions"
          description="Applies to the next request, including continued sessions. Running requests keep their original instructions. Leave blank to use only the Harness defaults."
          disabled={disabled}
        />
      }
    />
  );
}
