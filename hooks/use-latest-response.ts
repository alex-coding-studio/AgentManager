'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  LatestResponseDocument,
  ResponseModule,
} from '@/lib/execution-observability/types';

const RUNNING_INTERVAL_MS = 1_500;
const IDLE_INTERVAL_MS = 5_000;

export type LatestResponseTarget = ResponseModule | { card: string } | null;

export function useLatestResponse(
  projectId: string,
  target: LatestResponseTarget,
  initial: LatestResponseDocument | null = null,
) {
  const [document, setDocument] = useState(initial);
  const busy = useRef(false);
  const query =
    target === null
      ? null
      : typeof target === 'string'
        ? `module=${target}`
        : `card=${target.card}`;
  const refresh = useCallback(async () => {
    if (busy.current || !query) return document;
    busy.current = true;
    try {
      const response = await fetch(
        `/api/projects/${projectId}/latest-response?${query}`,
        { cache: 'no-store' },
      );
      if (!response.ok) return document;
      const payload = (await response.json()) as {
        response: LatestResponseDocument | null;
      };
      setDocument(payload.response);
      return payload.response;
    } catch {
      return document;
    } finally {
      busy.current = false;
    }
  }, [document, query, projectId]);
  const running = document?.status === 'running';
  useEffect(() => {
    if (!query) return;
    const timer = setInterval(
      () => void refresh(),
      running ? RUNNING_INTERVAL_MS : IDLE_INTERVAL_MS,
    );
    return () => clearInterval(timer);
  }, [query, refresh, running]);
  return { document, running, refresh, setDocument };
}
