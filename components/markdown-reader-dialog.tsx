'use client';

import type { ReactNode } from 'react';
import { MarkdownReader } from '@/components/markdown-reader';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export type MarkdownReaderDialogPreview = {
  title: string;
  path: string;
  markdown: string;
};

export function MarkdownReaderDialog({
  preview,
  onClose,
  showFocusButton = true,
  readerClassName,
  children,
}: {
  preview: MarkdownReaderDialogPreview | null;
  onClose: () => void;
  showFocusButton?: boolean;
  readerClassName?: string;
  children?: ReactNode;
}) {
  return (
    <Dialog open={preview !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[92vh] overflow-hidden bg-transparent p-0 ring-0 sm:max-w-[min(92vw,1100px)]"
      >
        {preview ? (
          <div className={cn(children && 'space-y-3')}>
            <MarkdownReader
              title={preview.title}
              filePath={preview.path}
              markdown={preview.markdown}
              onClose={onClose}
              showFocusButton={showFocusButton}
              className={cn('max-h-[92vh] overflow-y-auto', readerClassName)}
            />
            {children}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
