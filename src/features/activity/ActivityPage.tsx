import { useState } from 'react';
import { Link } from 'react-router';
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

const dateFormatter = new Intl.DateTimeFormat('ru', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export function ActivityPage() {
  const { query, read, isReading } = useActivity();
  const [filter, setFilter] = useState('all');
  const count = unreadCount(query.data);
  const items = query.data?.items.filter((item) => filter === 'all' || !item.isRead) ?? [];
  return (
    <section className="page-content">
      <header className="page-heading">
        <div>
          <h1>Уведомления</h1>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              aria-label="Обновить уведомления"
              disabled={query.isFetching || isReading}
              onClick={() => void query.refetch()}
            >
              <RefreshCw className={query.isFetching ? 'animate-spin' : ''} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Обновить уведомления</TooltipContent>
        </Tooltip>
      </header>
      <Tabs value={filter} onValueChange={setFilter}>
        <div className="activity-toolbar">
          <TabsList aria-label="Фильтр уведомлений">
            <TabsTrigger value="all" className="px-3">
              Все
            </TabsTrigger>
            <TabsTrigger value="unread" className="px-3">
              Непрочитанные
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
            title={!count ? 'Нет непрочитанных уведомлений' : undefined}
            onClick={() =>
              void read(query.data!.items.filter((item) => !item.isRead).map((item) => item.id))
            }
          >
            <Check />
            {isReading
              ? 'Сохраняем…'
              : query.data?.complete === false
                ? 'Прочитать загруженные'
                : 'Прочитать всё'}
          </Button>
        </div>
        <TabsContent value={filter}>
          {query.isError && (
            <ErrorNotice message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
          )}
          {query.data?.complete === false && (
            <Alert className="my-4" role="status">
              <AlertDescription>
                Загружена часть истории. Счётчик показывает минимум непрочитанных.
              </AlertDescription>
            </Alert>
          )}
          {query.isPending ? (
            <Loading>Загружаем уведомления…</Loading>
          ) : items.length === 0 ? (
            <EmptyState
              title={
                query.isError
                  ? 'Пока не удалось загрузить события'
                  : filter === 'unread'
                    ? 'Всё прочитано'
                    : 'Уведомлений пока нет'
              }
            >
              {query.isError
                ? 'Повторите запрос, когда соединение восстановится.'
                : 'Новые ответы появятся здесь автоматически, пока сайт открыт.'}
            </EmptyState>
          ) : (
            <ul className="activity-list">
              {items.map((item) => (
                <li key={item.id} className={`activity-row ${item.isRead ? '' : 'unread'}`}>
                  <Avatar name={item.post?.owner.nickname ?? 'Friendly'} />
                  <div className="event-body">
                    <div className="event-title">
                      <strong>{item.post?.owner.nickname ?? 'Friendly'}</strong>
                      <span>
                        {item.kind === 'reply' ? 'ответил(а) в обсуждении' : 'новое событие'}
                      </span>
                    </div>
                    <p className="event-text">
                      {item.post?.text ?? 'Это событие пока не поддерживается клиентом.'}
                    </p>
                    <div className="event-meta">
                      <time dateTime={item.instant}>
                        {dateFormatter.format(new Date(item.instant))}
                      </time>
                      {!item.isRead && <Badge variant="secondary">Новое</Badge>}
                    </div>
                    <div className="event-actions">
                      {item.post && (
                        <Button asChild variant="link" className="px-0">
                          <Link
                            to={`/post/${item.post.id}`}
                            state={{ accessHash: item.post.accessHash }}
                            onClick={() => {
                              if (!item.isRead) void read([item.id]);
                            }}
                          >
                            Открыть ответ
                            <ArrowUpRight />
                          </Link>
                        </Button>
                      )}
                      {!item.isRead && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Отметить прочитанным"
                          title="Отметить прочитанным"
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
      <footer className="activity-footer">
        <span>
          {query.dataUpdatedAt
            ? `Обновлено в ${new Date(query.dataUpdatedAt).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}`
            : 'Ожидаем обновления'}
        </span>
        <span>Автообновление · 30 сек.</span>
      </footer>
    </section>
  );
}
