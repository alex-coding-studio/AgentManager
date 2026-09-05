'use client';

import { useCallback, useSyncExternalStore } from 'react';

export type SurfaceKind = 'latest-response' | 'composer';

export function surfacePreferenceKey(
  projectId: string,
  scope: string,
  surface: SurfaceKind,
) {
  return `praxis:surface:v1:${projectId}:${scope}:${surface}`;
}

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

function readPreference(key: string) {
  try {
    return window.localStorage.getItem(key) === 'collapsed';
  } catch {
    return false;
  }
}

export function useSurfacePreference(
  projectId: string,
  scope: string,
  surface: SurfaceKind,
): [boolean, (collapsed: boolean) => void] {
  const key = surfacePreferenceKey(projectId, scope, surface);
  const collapsed = useSyncExternalStore(
    subscribe,
    () => readPreference(key),
    () => false,
  );
  const setCollapsed = useCallback(
    (next: boolean) => {
      try {
        window.localStorage.setItem(key, next ? 'collapsed' : 'expanded');
      } catch {}
      for (const listener of listeners) listener();
    },
    [key],
  );
  return [collapsed, setCollapsed];
}
