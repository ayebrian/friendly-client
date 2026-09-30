import { useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Link, Navigate, NavLink, Route, Routes, useNavigate } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Bell, LogOut, Plus, UserRound, ChevronDown } from 'lucide-react';
import type { Authorization } from '../domain/models';
import { createFriendlyGateway } from '../infrastructure/friendly-gateway';
import { createDemoGateway } from '../infrastructure/demo-gateway';
import { sessionStorageAdapter } from '../infrastructure/session-storage';
import { RuntimeContext } from '../shared/runtime';
import { ApiError } from '../shared/errors';
import { ErrorNotice } from '../shared/feedback';
import { Button } from '../shared/ui/button';
import { Badge } from '../shared/ui/badge';
import { TooltipProvider } from '../shared/ui/tooltip';
import { Toaster } from '../shared/ui/sonner';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '../shared/ui/dropdown-menu';
import { toast } from 'sonner';
import { LoginPage } from '../features/session/LoginPage';
import { ActivityProvider, useActivity } from '../features/activity/ActivityProvider';
import { ActivityPage } from '../features/activity/ActivityPage';
import { countLabel, unreadCount } from '../features/activity/service';
import { ProfilePage } from '../features/profile/ProfilePage';
import { ThreadPage } from '../features/posts/ThreadPage';

const baseUrl = import.meta.env.VITE_API_BASE_URL || 'https://api.getfriend.ly';
type Session = { mode: 'live'; authorization: Authorization } | { mode: 'demo' };

export function App() {
  const [session, setSession] = useState<Session | null>(() => {
    const authorization = sessionStorageAdapter.read();
    return authorization ? { mode: 'live', authorization } : null;
  });
  const [notice, setNotice] = useState('');
  const publicGateway = useMemo(() => createFriendlyGateway({ baseUrl }), []);
  const actions = useMemo(
    () => ({
      login(value: Authorization) {
        sessionStorageAdapter.write(value);
        setNotice('');
        setSession({ mode: 'live', authorization: value });
      },
      logout() {
        sessionStorageAdapter.write(null);
        setSession(null);
        setNotice('');
      },
      expire() {
        sessionStorageAdapter.write(null);
        setSession(null);
        setNotice('Сессия завершилась. Войдите снова.');
      },
    }),
    [],
  );
  return (
    <TooltipProvider delayDuration={300}>
      <BrowserRouter>
        {session ? (
          <SessionApp session={session} logout={actions.logout} expire={actions.expire} />
        ) : (
          <LoginPage
            gateway={publicGateway}
            onLogin={actions.login}
            onDemo={() => {
              setNotice('');
              setSession({ mode: 'demo' });
            }}
            notice={notice}
          />
        )}
      </BrowserRouter>
    </TooltipProvider>
  );
}

function SessionApp({
  session,
  logout,
  expire,
}: {
  session: Session;
  logout: () => void;
  expire: () => void;
}) {
  const client = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: (attempt, error) =>
              !(
                error instanceof ApiError && [400, 401, 403, 404, 429, 502].includes(error.status)
              ) && attempt < 2,
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
            staleTime: 30_000,
          },
          mutations: { retry: false },
        },
      }),
    [],
  );
  const runtime = useMemo(() => {
    if (session.mode === 'demo') {
      const demo = createDemoGateway();
      return {
        gateway: demo.gateway,
        isDemo: true,
        logout,
        simulate: () => {
          demo.simulate();
          void client.invalidateQueries({ queryKey: ['activity'] });
        },
      };
    }
    return {
      gateway: createFriendlyGateway({
        baseUrl,
        authorization: session.authorization,
        onUnauthorized: expire,
      }),
      isDemo: false,
      logout,
    };
  }, [session, logout, expire, client]);
  useEffect(
    () => () => {
      void client.cancelQueries();
      client.clear();
      toast.dismiss();
    },
    [client],
  );
  return (
    <RuntimeContext value={runtime}>
      <QueryClientProvider client={client}>
        <ActivityProvider>
          <Toaster
            position="bottom-right"
            closeButton
            duration={8000}
            offset={28}
            mobileOffset={{ bottom: 90, left: 12, right: 12 }}
            containerAriaLabel="Уведомления приложения"
          />
          <Shell isDemo={runtime.isDemo} logout={logout} simulate={runtime.simulate} />
        </ActivityProvider>
      </QueryClientProvider>
    </RuntimeContext>
  );
}

function Shell({
  isDemo,
  logout,
  simulate,
}: {
  isDemo: boolean;
  logout: () => void;
  simulate?: () => void;
}) {
  const { query, announcement, dismissAnnouncement, mutationError } = useActivity();
  const navigate = useNavigate();
  const count = unreadCount(query.data);
  const label = countLabel(query.data);
  const showBadge = count > 0 || query.data?.complete === false;
  useEffect(() => {
    document.title = showBadge ? `(${label}) Friendly` : 'Friendly';
    return () => {
      document.title = 'Friendly';
    };
  }, [label, showBadge]);
  useEffect(() => {
    if (!announcement) return;
    toast.info(announcement.kind === 'reply' ? 'Новый ответ' : 'Новое событие', {
      id: `activity-${announcement.id}`,
      description: announcement.post
        ? `${announcement.post.owner.nickname}: ${announcement.post.text.slice(0, 90)}`
        : 'Откройте уведомления',
      action: { label: 'Посмотреть', onClick: () => void navigate('/activity') },
    });
    dismissAnnouncement();
  }, [announcement, navigate, dismissAnnouncement]);
  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="topbar-inner">
          <div className="brand-group">
            <Link to="/activity" className="wordmark">
              Friendly
            </Link>
            {isDemo && <Badge variant="secondary">Демо</Badge>}
          </div>
          <div className="topbar-actions">
            {isDemo && (
              <Button
                variant="ghost"
                className="demo-action"
                aria-label="Добавить событие"
                onClick={simulate}
              >
                <Plus />
                <span>Добавить событие</span>
              </Button>
            )}
            <div className="sync-state" role="status">
              <span className={`status-dot ${query.isError ? 'offline' : ''}`} />
              {query.isError ? 'Ошибка обновления' : query.isFetching ? 'Обновляем…' : 'Обновлено'}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="account-menu" aria-label="Меню аккаунта">
                  <UserRound />
                  <span>Аккаунт</span>
                  <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" collisionPadding={12} className="min-w-48">
                <DropdownMenuLabel>{isDemo ? 'Демонстрация' : 'Friendly'}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild className="min-h-11">
                  <Link to="/profile">
                    <UserRound />
                    Мой профиль
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem className="min-h-11" onSelect={logout}>
                  <LogOut />
                  {isDemo ? 'Выйти из демо' : 'Выйти'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <div className="app-body">
        <aside className="sidebar">
          <nav aria-label="Главное меню">
            <NavLink to="/activity">
              <Bell size={19} />
              <span>Уведомления</span>
              {showBadge && (
                <Badge className="count-badge" aria-label={`${label} непрочитанных`}>
                  {label}
                </Badge>
              )}
            </NavLink>
            <NavLink to="/profile">
              <UserRound size={19} />
              <span>Мой профиль</span>
            </NavLink>
          </nav>
          <a className="network-link" href="https://getfriend.ly" target="_blank" rel="noreferrer">
            Сеть Friendly ↗
          </a>
        </aside>
        <main className="main-column">
          {mutationError && (
            <div className="global-notice">
              <ErrorNotice message={mutationError} />
            </div>
          )}
          <Routes>
            <Route path="/activity" element={<ActivityPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/post/:id" element={<ThreadPage />} />
            <Route path="*" element={<Navigate to="/activity" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
