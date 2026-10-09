import { PageHeader } from '../../shared/page-header';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useRuntime } from '../../shared/runtime';
import { Button } from '../../shared/ui/button';
import { ErrorNotice, EmptyState } from '../../shared/feedback';
import { errorMessage } from '../../shared/errors';
import { PostCard } from './PostCard';
import { PostComposer } from './PostComposer';
import { PostListSkeleton } from './PostListSkeleton';
import { useOperation } from '../../shared/use-operation';
import { Loader2, UserRound } from 'lucide-react';

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
  const errorNotice = query.isError && (
    <ErrorNotice
      message={errorMessage(query.error)}
      onRetry={() => void (query.isFetchNextPageError ? query.fetchNextPage() : query.refetch())}
    />
  );
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
      {!items.length && errorNotice}
      {query.isPending ? (
        <PostListSkeleton />
      ) : !items.length && !query.isError ? (
        <EmptyState title="It is quiet here">
          Start a conversation. Share what is on your mind.
        </EmptyState>
      ) : (
        <div className="post-list">
          {items.map((post) => (
            <PostCard key={post.id} post={post} openThread />
          ))}
        </div>
      )}
      {!!items.length && errorNotice}
      {query.isFetchingNextPage && <PostListSkeleton count={2} label="Loading more posts" />}
      {query.hasNextPage && (
        <Button
          className="load-more feed-load-more"
          variant="outline"
          disabled={query.isFetching}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage && (
            <Loader2 className="motion-safe:animate-spin" aria-hidden="true" />
          )}
          {query.isFetchingNextPage ? 'Loading more…' : 'Show more'}
        </Button>
      )}
    </section>
  );
}
