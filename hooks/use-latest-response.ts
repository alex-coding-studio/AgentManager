'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  LatestResponseDocument,
  ResponseModule,
} from '@/lib/execution-observability/types';

const RUNNING_INTERVAL_MS = 1_500;
const IDLE_INTERVAL_MS = 5_000;

export function useLatestResponse(
  projectId: string,
  module: ResponseModule,
  initial: LatestResponseDocument | null = null,
) {
  const [document, setDocument] = useState(initial);
  const busy = useRef(false);
  const refresh = useCallback(async () => {
    if (busy.current) return document;
    busy.current = true;
    try {
      const response = await fetch(
        `/api/projects/${projectId}/latest-response?module=${module}`,
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
  }, [document, module, projectId]);
  const running = document?.status === 'running';
  useEffect(() => {
    const timer = setInterval(
      () => void refresh(),
      running ? RUNNING_INTERVAL_MS : IDLE_INTERVAL_MS,
    );
    return () => clearInterval(timer);
  }, [refresh, running]);
  return { document, running, refresh, setDocument };
}
