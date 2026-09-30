import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useParams } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { useRuntime } from '../../shared/runtime';
import { ErrorNotice, Loading } from '../../shared/feedback';
import { Alert, AlertDescription } from '../../shared/ui/alert';
import { errorMessage } from '../../shared/errors';

export function ThreadPage() {
  const { gateway } = useRuntime();
  const { id } = useParams();
  const state = useLocation().state as { accessHash?: string } | null;
  const accessHash = typeof state?.accessHash === 'string' ? state.accessHash : '';
  const postId = Number(id);
  const valid = Number.isSafeInteger(postId) && postId >= 0 && !!accessHash;
  const query = useQuery({
    queryKey: ['thread', postId, accessHash],
    queryFn: ({ signal }) => gateway.thread(postId, accessHash, signal),
    enabled: valid,
  });
  return (
    <section className="page-content">
      <Link className="back-link" to="/activity">
        <ArrowLeft size={18} />К уведомлениям
      </Link>
      <header className="page-heading">
        <h1>Обсуждение</h1>
      </header>
      {!valid ? (
        <p>Откройте ответ из списка уведомлений.</p>
      ) : query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <ErrorNotice message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : (
        <div className="thread-content">
          <article>
            <h2>{query.data.post.owner.nickname || 'Удалённая публикация'}</h2>
            <p>{query.data.post.text}</p>
          </article>
          <h3>Ответы</h3>
          {query.data.replies.length ? (
            query.data.replies.map((reply, index) => (
              <article key={`${reply.id}-${index}`}>
                <strong>{reply.owner.nickname}</strong>
                <p>{reply.text}</p>
              </article>
            ))
          ) : (
            <p className="muted">Ответов пока нет.</p>
          )}
          {query.data.hasMore && (
            <Alert role="status" className="my-4">
              <AlertDescription>
                Показана первая страница ответов. Полное обсуждение доступно в официальном клиенте.
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}
    </section>
  );
}
