// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { StrictMode } from 'react';

// jsdom has no pointer capture; Sonner uses the browser API for swipe dismissal.
beforeAll(() => {
  Object.defineProperties(HTMLElement.prototype, {
    setPointerCapture: { configurable: true, value() {} },
    releasePointerCapture: { configurable: true, value() {} },
    hasPointerCapture: {
      configurable: true,
      value() {
        return false;
      },
    },
  });
});

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const owner = { id: 2, nickname: 'Тестовый автор', description: '', interests: [] };
const event = {
  id: 1,
  type: 'reply',
  instant: '2026-09-30T12:00:00Z',
  isRead: false,
  post: {
    id: 10,
    accessHash: 'hash',
    text: 'Тестовый ответ',
    owner,
    instant: '2026-09-30T12:00:00Z',
  },
};
const auth = { id: 1, token: 'test-token', accessHash: 'test-hash' };

describe('session and notification integration', () => {
  it('polls activity on a different page without enabling push', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    let events = [event];
    sessionStorage.setItem('friendly.session.v1', JSON.stringify(auth));
    history.replaceState(null, '', '/profile');
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (url) => {
        if (String(url).endsWith('/activity/list'))
          return new Response(JSON.stringify({ data: events, nextId: null }));
        if (String(url).endsWith('/users/details2'))
          return new Response(JSON.stringify({ user: owner }));
        throw new Error('unexpected endpoint');
      }),
    );
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    await screen.findByRole('heading', { name: 'Тестовый автор' });
    await waitFor(() => expect(document.title).toBe('(1) Friendly'));
    events = [{ ...event, id: 2 }, event];
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    await waitFor(() => expect(document.title).toBe('(2) Friendly'));
    await screen.findByText('Новый ответ');
  });
  it('updates badge and announces new events while viewing another route', async () => {
    const user = userEvent.setup();
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    await user.click(screen.getByRole('button', { name: 'Открыть демонстрацию' }));
    await screen.findByRole('heading', { name: 'Уведомления' });
    await waitFor(() => expect(document.title).toBe('(3) Friendly'));
    await user.click(screen.getByRole('link', { name: 'Мой профиль' }));
    await screen.findByRole('heading', { name: 'Александр' });
    await user.click(screen.getByRole('button', { name: 'Добавить событие' }));
    await waitFor(() => expect(document.title).toBe('(4) Friendly'));
    await screen.findByText('Новый ответ');
    await user.click(screen.getByRole('button', { name: 'Посмотреть' }));
    await screen.findByText('Новое событие появилось, пока вы были на другой странице.');
    await user.click(screen.getByRole('button', { name: 'Прочитать всё' }));
    await waitFor(() => expect(document.title).toBe('Friendly'));
    expect(sessionStorage.getItem('friendly.session.v1')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Меню аккаунта' }));
    await user.click(screen.getByRole('menuitem', { name: 'Выйти из демо' }));
    await screen.findByRole('heading', { name: 'Вход в Friendly' });
    expect(screen.queryByText('Марина')).toBeNull();
  });

  it('restores unread status and badge after a failed read', async () => {
    sessionStorage.setItem('friendly.session.v1', JSON.stringify(auth));
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      if (String(url).includes('/activity/read/')) return new Response(null, { status: 500 });
      if (String(url).endsWith('/activity/list'))
        return new Response(JSON.stringify({ data: [event], nextId: null }));
      throw new Error(`Unexpected request ${String(url)}`);
    });
    vi.stubGlobal('fetch', fetcher);
    const user = userEvent.setup();
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    await screen.findByText('Тестовый ответ');
    await user.click(screen.getByRole('button', { name: 'Отметить прочитанным' }));
    await screen.findByRole('alert');
    await waitFor(() => expect(document.title).toBe('(1) Friendly'));
    expect(screen.getByText('Новое')).toBeTruthy();
  });

  it('expires session and removes account cache on authenticated 401', async () => {
    sessionStorage.setItem('friendly.session.v1', JSON.stringify(auth));
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 401 })),
    );
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    await screen.findByRole('heading', { name: 'Вход в Friendly' });
    expect(sessionStorage.getItem('friendly.session.v1')).toBeNull();
    expect(screen.getByText('Сессия завершилась. Войдите снова.')).toBeTruthy();
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('signs in through email code endpoints and opens the authenticated list', async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      if (String(url).endsWith('/auth/email')) return new Response(null);
      if (String(url).endsWith('/auth/login')) return new Response(JSON.stringify(auth));
      if (String(url).endsWith('/activity/list'))
        return new Response(JSON.stringify({ data: [event], nextId: null }));
      throw new Error('unexpected endpoint');
    });
    vi.stubGlobal('fetch', fetcher);
    const user = userEvent.setup();
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    await user.type(screen.getByLabelText('Электронная почта'), 'test@example.test');
    await user.click(screen.getByRole('button', { name: 'Получить код' }));
    await user.type(await screen.findByLabelText(/Код из письма/), '12345678');
    await user.click(screen.getByRole('button', { name: 'Войти' }));
    await screen.findByText('Тестовый ответ');
    expect(JSON.parse(sessionStorage.getItem('friendly.session.v1')!)).toEqual(auth);
  });
});

describe('forms and keyboard navigation', () => {
  it('keeps invalid email and incomplete code out of the API', async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      if (String(url).endsWith('/auth/email')) return new Response(null);
      throw new Error('Unexpected request');
    });
    vi.stubGlobal('fetch', fetcher);
    const user = userEvent.setup();
    render(<App />);
    const email = screen.getByLabelText('Электронная почта');
    await user.type(email, 'wrong-email');
    await user.click(screen.getByRole('button', { name: 'Получить код' }));
    await screen.findByText('Введите корректный адрес почты.');
    expect(email.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(email.getAttribute('aria-describedby')!)?.textContent).toContain(
      'Введите корректный адрес почты.',
    );
    expect(fetcher).not.toHaveBeenCalled();
    await user.clear(email);
    await user.type(email, 'test@example.test');
    await user.click(screen.getByRole('button', { name: 'Получить код' }));
    const code = await screen.findByLabelText('Код из письма');
    await user.type(code, '1234');
    await user.click(screen.getByRole('button', { name: 'Войти' }));
    await screen.findByText('Введите все 8 цифр кода из письма.');
    expect(code.getAttribute('aria-invalid')).toBe('true');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('changes the unread filter with arrow keys and presents an empty state', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Открыть демонстрацию' }));
    await screen.findAllByText('Марина');
    await user.click(screen.getByRole('button', { name: 'Прочитать всё' }));
    await waitFor(() => expect(document.title).toBe('Friendly'));
    const all = screen.getByRole('tab', { name: 'Все' });
    all.focus();
    await user.keyboard('{ArrowRight}');
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Непрочитанные' }).getAttribute('aria-selected')).toBe(
        'true',
      ),
    );
    await screen.findByRole('heading', { name: 'Всё прочитано' });
    const panel = screen.getByRole('tabpanel');
    expect(document.getElementById(panel.getAttribute('aria-labelledby')!)?.textContent).toBe(
      'Непрочитанные',
    );
  });

  it('closes account menu with Escape and returns keyboard focus', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Открыть демонстрацию' }));
    await screen.findAllByText('Марина');
    const trigger = screen.getByRole('button', { name: 'Меню аккаунта' });
    trigger.focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('menuitem', { name: 'Выйти из демо' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(screen.getByRole('heading', { name: 'Уведомления' })).toBeTruthy();
  });
});
