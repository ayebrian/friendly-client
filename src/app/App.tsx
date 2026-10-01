import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  ScrollRestoration,
  useLocation,
  useNavigate,
} from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Bell,
  LogOut,
  Plus,
  UserRound,
  ChevronDown,
  Newspaper,
  SquarePen,
  Users,
  Settings,
} from 'lucide-react';
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
import { CommunityPage } from '../features/posts/CommunityPage';
import { ComposePage } from '../features/posts/ComposePage';
import { EditProfilePage } from '../features/profile/EditProfilePage';
import { CircleAside } from '../features/people/CircleAside';
import { PeoplePage, FriendsPage } from '../features/people/PeoplePage';
import { PersonPage } from '../features/people/PersonPage';
import { InvitePage } from '../features/people/InvitePage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { RegisterPage } from '../features/session/RegisterPage';
import { PreferencesProvider } from '../shared/preferences';
import { enablePush, disablePush } from '../infrastructure/push';

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
        setNotice('Your session has ended. Please sign in again.');
      },
    }),
    [],
  );
  return (
    <PreferencesProvider>
      <TooltipProvider delayDuration={300}>
        <>
          {session ? (
            <SessionApp session={session} logout={actions.logout} expire={actions.expire} />
          ) : (
            <Routes>
              <Route
                path="/signup"
                element={<RegisterPage gateway={publicGateway} onLogin={actions.login} />}
              />
              <Route
                path="*"
                element={
                  <LoginPage
                    gateway={publicGateway}
                    onLogin={actions.login}
                    onDemo={() => {
                      setNotice('');
                      setSession({ mode: 'demo' });
                    }}
                    notice={notice}
                  />
                }
              />
            </Routes>
          )}
          <ScrollRestoration />
        </>
      </TooltipProvider>
    </PreferencesProvider>
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
  const [lifetime] = useState(() => ({ current: new AbortController() }));
  // Reset the session lifetime before child query effects run, including StrictMode remounts.
  useLayoutEffect(() => {
    lifetime.current = new AbortController();
    return () => lifetime.current.abort();
  }, [lifetime]);
  const runtime = useMemo(() => {
    if (session.mode === 'demo') {
      const demo = createDemoGateway();
      return {
        gateway: demo.gateway,
        isDemo: true,
        userId: 1,
        logout,
        enablePush: async () => {
          throw new Error('Push notifications require a real account.');
        },
        disablePush: async () => {},
        dispose: demo.dispose,
        simulate: () => {
          demo.simulate();
          void client.invalidateQueries({ queryKey: ['activity'] });
        },
      };
    }
    const gateway = createFriendlyGateway({
      baseUrl,
      authorization: session.authorization,
      sessionSignal: () => lifetime.current.signal,
      onUnauthorized: expire,
    });
    return {
      gateway,
      isDemo: false,
      userId: session.authorization.id,
      logout: () => {
        lifetime.current.abort();
        void disablePush().catch(() => {});
        logout();
      },
      enablePush: () => enablePush(gateway, lifetime.current.signal),
      disablePush,
      dispose: () => {},
    };
  }, [session, logout, expire, client, lifetime]);
  useEffect(() => {
    if (runtime.isDemo || !('serviceWorker' in navigator)) return;
    const refresh = (event: MessageEvent) => {
      if (event.data?.type === 'friendly:refresh') {
        void client.invalidateQueries({ queryKey: ['activity'] });
        void client.invalidateQueries({ queryKey: ['discover'] });
      }
    };
    navigator.serviceWorker.addEventListener('message', refresh);
    return () => navigator.serviceWorker.removeEventListener('message', refresh);
  }, [runtime.isDemo, client]);
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
            containerAriaLabel="App notifications"
          />
          <Shell isDemo={runtime.isDemo} logout={runtime.logout} simulate={runtime.simulate} />
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
  const { pathname } = useLocation();
  const showMobileCompose = ['/community', '/activity', '/profile'].includes(pathname);
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
    toast.info(announcement.kind === 'reply' ? 'New reply' : 'New activity', {
      id: `activity-${announcement.id}`,
      description: announcement.post
        ? `${announcement.post.owner.nickname}: ${announcement.post.text.slice(0, 90)}`
        : 'Open notifications',
      action: { label: 'View', onClick: () => void navigate('/activity') },
    });
    dismissAnnouncement();
  }, [announcement, navigate, dismissAnnouncement]);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="app-body">
        <aside className="sidebar">
          <div className="brand-group">
            <Link to="/community" className="wordmark" aria-label="Friendly home">
              <span className="brand-short">F</span>
              <span className="brand-full">Friendly</span>
            </Link>
            {isDemo && <Badge variant="secondary">Demo</Badge>}
          </div>

          <nav aria-label="Main navigation">
            <NavLink to="/community" aria-label="Home">
              <Newspaper size={19} />
              <span>Home</span>
            </NavLink>
            <NavLink to="/people" aria-label="People">
              <Users size={19} />
              <span>People</span>
            </NavLink>
            <NavLink to="/activity" aria-label="Notifications">
              <Bell size={19} />
              <span className="nav-label-desktop">Notifications</span>
              <span className="nav-label-mobile" aria-hidden="true">
                Activity
              </span>
              {showBadge && (
                <Badge className="count-badge" aria-label={`${label} unread`}>
                  {label}
                </Badge>
              )}
            </NavLink>
            <NavLink to="/profile" aria-label="My profile">
              <UserRound size={19} />
              <span>Profile</span>
            </NavLink>
          </nav>
          <Button
            asChild
            className={`nav-compose${showMobileCompose ? '' : ' nav-compose-desktop'}`}
          >
            <Link to="/compose" aria-label="New post">
              <SquarePen />
              <span>New post</span>
            </Link>
          </Button>
          <div className="sidebar-footer">
            <div className="topbar-actions">
              {isDemo && (
                <Button
                  variant="ghost"
                  className="demo-action"
                  aria-label="Add activity"
                  onClick={simulate}
                >
                  <Plus />
                  <span>Add activity</span>
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="account-menu" aria-label="Account menu">
                    <UserRound />
                    <span>Account</span>
                    <ChevronDown />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" collisionPadding={12} className="min-w-48">
                  <DropdownMenuLabel>{isDemo ? 'Demo' : 'Friendly'}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild className="min-h-11">
                    <Link to="/settings">
                      <Settings />
                      Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="min-h-11">
                    <Link to="/invite">
                      <Users />
                      Invite a friend
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="min-h-11">
                    <Link to="/profile">
                      <UserRound />
                      My profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="min-h-11" onSelect={logout}>
                    <LogOut />
                    {isDemo ? 'Exit demo' : 'Sign out'}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <a className="network-link" href="https://getfriend.ly" target="_blank" rel="noreferrer">
            Friendly network ↗
          </a>
        </aside>
        <main className="main-column" id="main-content" tabIndex={-1}>
          {mutationError && (
            <div className="global-notice">
              <ErrorNotice message={mutationError} />
            </div>
          )}
          <Routes>
            <Route path="/community" element={<CommunityPage />} />
            <Route path="/compose" element={<ComposePage />} />
            <Route path="/people" element={<PeoplePage />} />
            <Route path="/people/:id/:hash" element={<PersonPage />} />
            <Route path="/friends" element={<FriendsPage />} />
            <Route path="/invite" element={<InvitePage />} />
            <Route path="/redirect/:deeplink" element={<InvitePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/profile/edit" element={<EditProfilePage />} />
            <Route path="/activity" element={<ActivityPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/post/:id" element={<ThreadPage />} />
            <Route path="/post/:id/:hash" element={<ThreadPage />} />
            <Route path="*" element={<Navigate to="/activity" replace />} />
          </Routes>
        </main>
        <CircleAside />
      </div>
    </div>
  );
}
