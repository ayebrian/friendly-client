import { BrandLogo } from '../shared/brand-logo';
import './validation-policy';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  UserRound,
  ChevronDown,
  Newspaper,
  SquarePen,
  Users,
  Settings,
} from 'lucide-react';
import type { Authorization } from '../domain/models';
import { createFriendlyGateway } from '../infrastructure/friendly-gateway';
import {
  hasLegacySession,
  migrateLegacySession,
  sameAuthorization,
  sessionStore,
} from '../infrastructure/session-storage';
import { RuntimeContext } from '../shared/runtime';
import { ApiError, errorMessage } from '../shared/errors';
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
import { LandingPage } from '../features/session/LandingPage';
import { InvitationEntryPage } from '../features/session/InvitationEntryPage';
import { invitationReference, signInDestination } from '../shared/links';
import { LoginPage } from '../features/session/LoginPage';
import { ActivityProvider, useActivity } from '../features/activity/ActivityProvider';
import { ActivityPage } from '../features/activity/ActivityPage';
import { activitySummary, countLabel, unreadCount } from '../features/activity/service';
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

// API requests go through the same-origin proxy (bff/proxy.ts), which keeps the token in
// an HttpOnly cookie. Media capability URLs still load directly from the public API.
const baseUrl = '/api';
const mediaBaseUrl = import.meta.env.VITE_API_BASE_URL || 'https://api.getfriend.ly';
type Session = { authorization: Authorization; pendingLogout: boolean };

export function App() {
  const [session, setSession] = useState<Session | null>(() => sessionStore.read());
  const [restoring, setRestoring] = useState(() => !session && hasLegacySession());
  const [notice, setNotice] = useState('');
  const location = useLocation();
  const publicGateway = useMemo(() => createFriendlyGateway({ baseUrl, mediaBaseUrl }), []);
  const actions = useMemo(() => {
    // Each action ends only `value`: another tab may already have signed in to another account.
    const end = (value: Authorization, message: string) => {
      sessionStore.clear(value);
      setSession((current) => endSession(current, value));
      setNotice(message);
    };
    return {
      login(value: Authorization) {
        sessionStore.write(value);
        setNotice('');
        setSession({ authorization: value, pendingLogout: false });
      },
      logout(value: Authorization) {
        end(value, '');
      },
      expire(value: Authorization) {
        end(value, 'Your session has ended. Please sign in again.');
      },
      // The proxy's cookie belongs to another account: follow it if this tab knows which.
      changed(value: Authorization) {
        const stored = sessionStore.read();
        if (stored && !stored.pendingLogout && !sameAuthorization(stored.authorization, value)) {
          setNotice('');
          setSession((current) =>
            current && sameAuthorization(current.authorization, value)
              ? { authorization: stored.authorization, pendingLogout: false }
              : current,
          );
        } else end(value, 'You signed in to another account in a different tab.');
      },
    };
  }, []);
  // A token saved by an earlier build moves into the proxy's HttpOnly cookie once.
  useEffect(() => {
    if (!restoring) return;
    let active = true;
    void migrateLegacySession(baseUrl).then((restored) => {
      if (!active) return;
      if (restored)
        setSession((current) =>
          current &&
          current.pendingLogout === restored.pendingLogout &&
          sameAuthorization(current.authorization, restored.authorization)
            ? current
            : restored,
        );
      setRestoring(false);
    });
    return () => {
      active = false;
    };
  }, [restoring]);
  // The cookie is shared by all tabs: follow sign-in and sign-out made in another tab.
  useEffect(
    () =>
      sessionStore.subscribe((next) => {
        setNotice('');
        setSession((current) => {
          // Another tab is revoking or has revoked the stored account.
          if (!next || next.pendingLogout) return null;
          if (current && sameAuthorization(current.authorization, next.authorization))
            return current;
          return { authorization: next.authorization, pendingLogout: false };
        });
      }),
    [],
  );
  if (restoring) return <StatusPage title="Restoring your session…" text="Signing you in." />;
  return (
    <PreferencesProvider>
      <TooltipProvider delayDuration={300}>
        <>
          {session ? (
            <SessionApp
              // A different account always gets a fresh tree and QueryClient.
              key={`${session.authorization.id}:${session.authorization.accessHash}`}
              session={session}
              logout={actions.logout}
              expire={actions.expire}
              changed={actions.changed}
            />
          ) : (
            <Routes>
              <Route
                path="/signup"
                element={<RegisterPage gateway={publicGateway} onLogin={actions.login} />}
              />
              <Route
                path="/"
                element={
                  invitationReference(location) !== null ? (
                    <InvitationEntryPage notice={notice} />
                  ) : (
                    <LandingPage />
                  )
                }
              />
              <Route path="/invite" element={<InvitationEntryPage notice={notice} />} />
              <Route path="/redirect/*" element={<InvitationEntryPage notice={notice} />} />
              <Route
                path="*"
                element={
                  <LoginPage gateway={publicGateway} onLogin={actions.login} notice={notice} />
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

function endSession(current: Session | null, value: Authorization) {
  return current && sameAuthorization(current.authorization, value) ? null : current;
}

function SessionApp({
  session,
  logout,
  expire,
  changed,
}: {
  session: Session;
  logout: (value: Authorization) => void;
  expire: (value: Authorization) => void;
  changed: (value: Authorization) => void;
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
  const mounted = useRef(false);
  const logoutBusy = useRef(false);
  const [signingOut, setSigningOut] = useState(session.pendingLogout);
  const [logoutError, setLogoutError] = useState('');
  // Reset the session lifetime before child query effects run, including StrictMode remounts.
  useLayoutEffect(() => {
    mounted.current = true;
    lifetime.current = new AbortController();
    return () => {
      mounted.current = false;
      lifetime.current.abort();
    };
  }, [lifetime, mounted]);
  const runtime = useMemo(() => {
    const account = session.authorization;
    const gateway = createFriendlyGateway({
      baseUrl,
      mediaBaseUrl,
      userId: account.id,
      sessionSignal: () => lifetime.current.signal,
      onUnauthorized: () => expire(account),
      onSessionChanged: () => changed(account),
    });
    // Revocation must remain usable when the account lifetime has been aborted.
    const logoutGateway = createFriendlyGateway({ baseUrl, mediaBaseUrl, userId: account.id });
    return {
      gateway,
      mediaBaseUrl,
      imageProxyUrl: import.meta.env.VITE_IMAGE_PROXY_URL || undefined,
      userId: session.authorization.id,
      logout: async () => {
        if (logoutBusy.current) return;
        logoutBusy.current = true;
        // The stored marker prevents a reload from reopening authenticated routes.
        sessionStore.beginLogout(account);
        setLogoutError('');
        setSigningOut(true);
        // Stop account operations immediately; the revoke call has its own lifetime.
        lifetime.current.abort();
        try {
          await logoutGateway.logout();
        } catch (error) {
          // The server has already rejected this token, so there is nothing left to revoke.
          if (!(error instanceof ApiError && error.status === 401)) {
            if (mounted.current) {
              sessionStore.restoreAfterFailedLogout(account);
              lifetime.current = new AbortController();
              setLogoutError(
                `Could not confirm sign-out. This account is still open in this tab. ${errorMessage(error)}`,
              );
              setSigningOut(false);
              void client.invalidateQueries();
            }
            logoutBusy.current = false;
            return;
          }
        }
        // A different account may have signed in while this request was pending.
        if (!mounted.current) {
          logoutBusy.current = false;
          return;
        }
        void disablePush().catch(() => {});
        logout(account);
        logoutBusy.current = false;
      },
      enablePush: () => enablePush(gateway, lifetime.current.signal),
      disablePush,
    };
  }, [session, logout, expire, changed, lifetime, mounted, client]);
  useEffect(() => {
    if (session.pendingLogout) void runtime.logout();
  }, [runtime, session.pendingLogout]);
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const refresh = (event: MessageEvent) => {
      if (event.data?.type === 'friendly:refresh') {
        void client.invalidateQueries({ queryKey: ['activity'] });
        void client.invalidateQueries({ queryKey: ['discover'] });
      }
    };
    navigator.serviceWorker.addEventListener('message', refresh);
    return () => navigator.serviceWorker.removeEventListener('message', refresh);
  }, [client]);
  useEffect(
    () => () => {
      void client.cancelQueries();
      client.clear();
      toast.dismiss();
    },
    [client],
  );
  if (signingOut)
    return <StatusPage title="Signing out…" text="Ending your session on Friendly." />;
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
          <Shell logout={runtime.logout} logoutError={logoutError} />
        </ActivityProvider>
      </QueryClientProvider>
    </RuntimeContext>
  );
}

function StatusPage({ title, text }: { title: string; text: string }) {
  return (
    <main className="registration-layout">
      <section className="registration-panel">
        <div className="wordmark">
          <BrandLogo />
        </div>
        <h1>{title}</h1>
        <p role="status" className="muted">
          {text}
        </p>
      </section>
    </main>
  );
}

function Shell({ logout, logoutError }: { logout: () => Promise<void>; logoutError: string }) {
  const { query, announcement, dismissAnnouncement, mutationError } = useActivity();
  const navigate = useNavigate();
  const location = useLocation();
  const { pathname } = location;
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
    const { title, description } = activitySummary(announcement);
    toast.info(title, {
      id: `activity-${announcement.id}`,
      description,
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
              <span className="brand-short">
                <BrandLogo compact />
              </span>
              <span className="brand-full">
                <BrandLogo />
              </span>
            </Link>
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="account-menu" aria-label="Account menu">
                    <UserRound />
                    <span>Account</span>
                    <ChevronDown />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" collisionPadding={12} className="min-w-48">
                  <DropdownMenuLabel>Friendly</DropdownMenuLabel>
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
                  <DropdownMenuItem className="min-h-11" onSelect={() => void logout()}>
                    <LogOut />
                    Sign out
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
          {logoutError && (
            <div className="global-notice">
              <ErrorNotice message={logoutError} />
            </div>
          )}
          {mutationError && (
            <div className="global-notice">
              <ErrorNotice message={mutationError} />
            </div>
          )}
          <Routes>
            <Route path="/login" element={<Navigate to={signInDestination(location)} replace />} />
            <Route
              path="/signup"
              element={<Navigate to={signInDestination(location, '/settings')} replace />}
            />
            <Route path="/community" element={<CommunityPage />} />
            <Route path="/compose" element={<ComposePage />} />
            <Route path="/people" element={<PeoplePage />} />
            <Route path="/people/:id/:hash" element={<PersonPage />} />
            <Route path="/friends" element={<FriendsPage />} />
            <Route path="/invite" element={<InvitePage key={pathname + location.hash} />} />
            <Route path="/redirect/*" element={<InvitePage key={pathname + location.hash} />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/profile/edit" element={<EditProfilePage />} />
            <Route path="/activity" element={<ActivityPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/post/:id" element={<ThreadPage />} />
            <Route path="/post/:id/:hash" element={<ThreadPage />} />
            <Route
              path="/"
              element={
                <Navigate
                  to={
                    invitationReference(location) !== null
                      ? `/invite${location.hash}`
                      : '/community'
                  }
                  replace
                />
              }
            />
            <Route path="*" element={<Navigate to="/community" replace />} />
          </Routes>
        </main>
        <CircleAside />
      </div>
    </div>
  );
}
