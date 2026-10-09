import { createContext, useContext } from 'react';
import type { FriendlyGateway } from '../domain/gateway';

export interface Runtime {
  gateway: FriendlyGateway;
  mediaBaseUrl?: string;
  imageProxyUrl?: string;
  userId: number;
  enablePush: () => Promise<void>;
  disablePush: () => Promise<void>;
  logout: () => void;
}

export const RuntimeContext = createContext<Runtime | null>(null);
export function useRuntime() {
  const runtime = useContext(RuntimeContext);
  if (!runtime) throw new Error('Runtime provider is missing');
  return runtime;
}
