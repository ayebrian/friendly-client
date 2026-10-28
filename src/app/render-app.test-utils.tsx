import { StrictMode, type ReactNode } from 'react';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import * as gatewayModule from '../infrastructure/friendly-gateway';
import { createFixtureGateway } from './fixture-gateway.test-utils';
import { createBrowserRouter, RouterProvider } from 'react-router';

const routers = new Set<ReturnType<typeof createBrowserRouter>>();
beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});
afterEach(() => {
  routers.forEach((router) => router.dispose());
  routers.clear();
  vi.restoreAllMocks();
});

/** Backend path of a request the app sent through the same-origin `/api` proxy. */
export function apiPath(url: unknown) {
  const path = new URL(String(url), location.origin).pathname;
  if (!path.startsWith('/api/')) throw new Error(`Request bypassed the API proxy: ${String(url)}`);
  return path.slice('/api'.length);
}

export function renderApp(element: ReactNode) {
  const router = createBrowserRouter([{ path: '*', element }]);
  routers.add(router);
  return render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
}

export function renderFixtureApp(element: ReactNode) {
  const fixture = createFixtureGateway();
  localStorage.setItem(
    'friendly.session.v2',
    JSON.stringify({ id: 1, accessHash: 'fixture-hash' }),
  );
  vi.spyOn(gatewayModule, 'createFriendlyGateway').mockReturnValue(fixture.gateway);
  if (location.pathname === '/') history.replaceState(null, '', '/activity');
  return { ...renderApp(element), fixture };
}
