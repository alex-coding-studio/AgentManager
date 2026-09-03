'use client';

import Link from 'next/link';
import { SlidersHorizontal } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { useUiText } from '@/components/ui-language-provider';
import { cn } from '@/lib/utils';

export function ModuleContextTrigger({
  href,
  onClick,
  disabled = false,
}: {
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const { t } = useUiText();
  const content = (
    <>
      <SlidersHorizontal />
      <span>{t('Context')}</span>
    </>
  );
  if (href)
    return (
      <Link
        href={href}
        data-slot="button"
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : undefined}
        className={cn(
          buttonVariants({ variant: 'outline', size: 'sm' }),
          disabled && 'pointer-events-none opacity-50',
        )}
      >
        {content}
      </Link>
    );
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled}
      onClick={onClick}
    >
      {content}
    </Button>
  );
}
