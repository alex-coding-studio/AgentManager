import type { ProviderSession } from '../../agents/session.ts';
export function materialize(session: ProviderSession) {
  return session.id;
}
