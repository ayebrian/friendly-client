import { StrictMode, type ReactNode } from 'react';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { createBrowserRouter, RouterProvider } from 'react-router';

const routers = new Set<ReturnType<typeof createBrowserRouter>>();
beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});
afterEach(() => {
  routers.forEach((router) => router.dispose());
  routers.clear();
});

export function renderApp(element: ReactNode) {
  const router = createBrowserRouter([{ path: '*', element }]);
  routers.add(router);
  return render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
}
