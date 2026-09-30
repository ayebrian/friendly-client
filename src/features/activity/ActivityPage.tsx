import { PageHeader } from '../../shared/page-header';
import { Link, useSearchParams } from 'react-router';
import { ArrowUpRight, Check, RefreshCw } from 'lucide-react';
import { Avatar, EmptyState, ErrorNotice, Loading } from '../../shared/feedback';
import { Button } from '../../shared/ui/button';
import { Badge } from '../../shared/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../shared/ui/tabs';
import { Alert, AlertDescription } from '../../shared/ui/alert';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../shared/ui/tooltip';
import { errorMessage } from '../../shared/errors';
import { useActivity } from './ActivityProvider';
import { countLabel, unreadCount } from './service';
import { postPath } from '../../shared/links';
import { PersonLink } from '../../shared/people';

const dateFormatter = new Intl.DateTimeFormat('en', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export function ActivityPage() {
  const { query, read, isReading } = useActivity();
  const [params, setParams] = useSearchParams();
  const filter = params.get('filter') === 'unread' ? 'unread' : 'all';
  const setFilter = (value: string) => {
    const next = new URLSearchParams(params);
    if (value === 'all') next.delete('filter');
    else next.set('filter', value);
    void setParams(next, { replace: true });
  };
  const count = unreadCount(query.data);
  const items = query.data?.items.filter((item) => filter === 'all' || !item.isRead) ?? [];
  return (
    <section className="page-content">
      <PageHeader>
        <div>
          <h1>Notifications</h1>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              aria-label="Refresh notifications"
              disabled={query.isFetching || isReading}
              onClick={() => void query.refetch()}
            >
              <RefreshCw className={query.isFetching ? 'animate-spin' : ''} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Refresh notifications</TooltipContent>
        </Tooltip>
      </PageHeader>
      <Tabs value={filter} onValueChange={setFilter}>
        <div className="activity-toolbar">
          <TabsList variant="line" aria-label="Notification filter">
            <TabsTrigger value="all" className="px-3">
              All
            </TabsTrigger>
            <TabsTrigger value="unread" className="px-3">
              Unread
              {(count > 0 || query.data?.complete === false) && (
                <Badge variant="secondary" className="ml-1 tabular-nums">
                  {countLabel(query.data)}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
          <Button
            variant="ghost"
            className="read-all"
            disabled={!count || isReading}
            title={!count ? 'No unread notifications' : undefined}
            onClick={() =>
              void read(query.data!.items.filter((item) => !item.isRead).map((item) => item.id))
            }
          >
            <Check />
            {isReading
              ? 'Saving…'
              : query.data?.complete === false
                ? 'Mark loaded as read'
                : 'Mark all as read'}
          </Button>
        </div>
        <TabsContent value={filter}>
          {query.isError && (
            <ErrorNotice message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
          )}
          {query.data?.complete === false && (
            <Alert className="my-4" role="status">
              <AlertDescription>
                Only part of your history is loaded. The count shows at least this many unread
                notifications.
              </AlertDescription>
            </Alert>
          )}
          {query.isPending ? (
            <Loading>Loading notifications…</Loading>
          ) : items.length === 0 ? (
            <EmptyState
              title={
                query.isError
                  ? 'Could not load activity'
                  : filter === 'unread'
                    ? 'You are all caught up'
                    : 'No notifications yet'
              }
            >
              {query.isError
                ? 'Try again when your connection is restored.'
                : 'New replies will appear here automatically while the app is open.'}
            </EmptyState>
          ) : (
            <ul className="activity-list">
              {items.map((item) => (
                <li key={item.id} className={`activity-row ${item.isRead ? '' : 'unread'}`}>
                  <Avatar
                    name={item.post?.owner.nickname ?? 'Friendly'}
                    file={item.post?.owner.avatar}
                  />
                  <div className="event-body">
                    <div className="event-title">
                      {item.post ? (
                        <PersonLink person={item.post.owner} />
                      ) : (
                        <strong>Friendly</strong>
                      )}
                      <span>{item.kind === 'reply' ? 'replied in a thread' : 'new activity'}</span>
                    </div>
                    <p className="event-text">
                      {item.post?.text ?? 'This activity is not supported by the app yet.'}
                    </p>
                    <div className="event-meta">
                      <time dateTime={item.instant}>
                        {dateFormatter.format(new Date(item.instant))}
                      </time>
                      {!item.isRead && <Badge variant="secondary">New</Badge>}
                    </div>
                    <div className="event-actions">
                      {item.post && (
                        <Button asChild variant="link" className="px-0">
                          <Link
                            to={postPath(item.post)}
                            onClick={() => {
                              if (!item.isRead) void read([item.id]);
                            }}
                          >
                            Open reply
                            <ArrowUpRight />
                          </Link>
                        </Button>
                      )}
                      {!item.isRead && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Mark as read"
                          title="Mark as read"
                          className="text-muted-foreground"
                          disabled={isReading}
                          onClick={() => void read([item.id])}
                        >
                          <Check />
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
      <footer className="activity-footer" role="status">
        <span>
          {query.dataUpdatedAt
            ? `Updated at ${new Date(query.dataUpdatedAt).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}`
            : 'Waiting for an update'}
        </span>
      </footer>
    </section>
  );
}
