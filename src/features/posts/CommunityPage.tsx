import { PageHeader } from '../../shared/page-header';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useRuntime } from '../../shared/runtime';
import { Button } from '../../shared/ui/button';
import { ErrorNotice, EmptyState, Loading } from '../../shared/feedback';
import { errorMessage } from '../../shared/errors';
import { PostCard } from './PostCard';
import { PostComposer } from './PostComposer';
import { useOperation } from '../../shared/use-operation';
import { UserRound } from 'lucide-react';

export function CommunityPage() {
  const { gateway } = useRuntime();
  const client = useQueryClient();
  const publish = useOperation((text: string, signal) => gateway.publish(text, undefined, signal));
  const query = useInfiniteQuery({
    queryKey: ['posts'],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => gateway.posts(pageParam, signal),
    getNextPageParam: (last, _pages, _param, params) =>
      last.nextCursor && !params.includes(last.nextCursor) ? last.nextCursor : undefined,
  });
  const items = [
    ...new Map(
      query.data?.pages.flatMap((page) => page.items).map((post) => [post.id, post]) ?? [],
    ).values(),
  ];
  return (
    <section className="page-content community-page">
      <PageHeader>
        <div>
          <h1>Home</h1>
          <p>Conversations from the community.</p>
        </div>
      </PageHeader>
      <div className="feed-composer">
        <div className="composer-avatar" aria-hidden="true">
          <UserRound />
        </div>
        <PostComposer
          compact
          label="What is happening?"
          onSubmit={async (text) => {
            await publish.mutateAsync(text);
            await client.invalidateQueries({ queryKey: ['posts'] });
          }}
        />
      </div>
      {query.isError && (
        <ErrorNotice message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      )}
      {query.isPending ? (
        <Loading />
      ) : !items.length && !query.isError ? (
        <EmptyState title="It is quiet here">
          Start a conversation. Share what is on your mind.
        </EmptyState>
      ) : (
        <div className="post-list">
          {items.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
      {query.hasNextPage && (
        <Button
          className="load-more"
          variant="outline"
          disabled={query.isFetching}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? 'Loading…' : 'Show more'}
        </Button>
      )}
    </section>
  );
}
