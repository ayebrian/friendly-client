import { PageHeader } from '../../shared/page-header';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useParams } from 'react-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Post } from '../../domain/models';
import { useRuntime } from '../../shared/runtime';
import { useOperation } from '../../shared/use-operation';
import { ErrorNotice, Loading } from '../../shared/feedback';
import { Button } from '../../shared/ui/button';
import { errorMessage } from '../../shared/errors';
import { PostCard } from './PostCard';
import { PostComposer } from './PostComposer';

export function ThreadPage() {
  const { id, hash } = useParams();
  return <Thread key={`${id}/${hash}`} />;
}

function Thread() {
  const { gateway } = useRuntime();
  const client = useQueryClient();
  const { id, hash } = useParams();
  const state = useLocation().state as { accessHash?: string } | null;
  const accessHash = hash || state?.accessHash || '';
  const postId = Number(id);
  const valid = Number.isSafeInteger(postId) && postId >= 0 && !!accessHash;
  const [editor, setEditor] = useState<{ mode: 'reply' | 'edit'; post: Post } | null>(null);
  const editorDirty = useRef(false);
  const editorElement = useRef<HTMLDivElement>(null);
  const handleDirtyChange = useCallback((dirty: boolean) => {
    editorDirty.current = dirty;
  }, []);
  useEffect(() => {
    if (!editor) return;
    // Focus after the post menu has restored focus to its trigger.
    const frame = requestAnimationFrame(() => {
      editorElement.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [editor]);
  function openEditor(next: NonNullable<typeof editor>) {
    if (editor?.mode === next.mode && editor.post.id === next.post.id) {
      editorElement.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus();
      return;
    }
    if (editorDirty.current && !window.confirm('Switch editors and discard your draft?')) return;
    setEditor(next);
  }
  const query = useInfiniteQuery({
    queryKey: ['thread', postId, accessHash],
    enabled: valid,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }) => {
      if (pageParam === null) return gateway.thread(postId, accessHash, signal);
      const page = await gateway.replies(postId, accessHash, pageParam, signal);
      return { post: null, upstream: [], replies: page.items, nextCursor: page.nextCursor };
    },
    getNextPageParam: (last, _pages, _param, params) =>
      last.nextCursor && !params.includes(last.nextCursor) ? last.nextCursor : undefined,
  });
  const operation = useOperation(
    async (input: { mode: 'reply' | 'edit' | 'delete'; post: Post; text?: string }, signal) => {
      if (input.mode === 'delete') await gateway.deletePost(input.post.id, signal);
      else if (input.mode === 'edit') await gateway.editPost(input.post.id, input.text!, signal);
      else
        await gateway.publish(
          input.text!,
          { id: input.post.id, accessHash: input.post.accessHash },
          signal,
        );
    },
  );
  const refresh = async () => {
    await Promise.all(
      ['thread', 'posts', 'activity'].map((key) => client.invalidateQueries({ queryKey: [key] })),
    );
  };
  const main = query.data?.pages[0];
  const branches = [
    ...new Map(
      query.data?.pages.flatMap((p) => p.replies).map((branch) => [branch.posts[0].id, branch]) ??
        [],
    ).values(),
  ];
  const card = (post: Post, isMain = false) => (
    <PostCard
      key={post.id}
      post={post}
      main={isMain}
      busy={operation.isPending}
      onReply={() => openEditor({ mode: 'reply', post })}
      onEdit={() => openEditor({ mode: 'edit', post })}
      onDelete={async () => {
        await operation.mutateAsync({ mode: 'delete', post });
        setEditor(null);
        await refresh();
      }}
    />
  );
  return (
    <section className="page-content thread-page">
      <PageHeader backTo="/community" backLabel="Back to feed">
        <h1>Thread</h1>
      </PageHeader>
      {!valid ? (
        <ErrorNotice message="This link is missing an access key. Open the thread from your feed or notifications." />
      ) : (
        <>
          {query.isError && (
            <ErrorNotice message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
          )}
          {query.isPending ? (
            <Loading />
          ) : (
            main?.post && (
              <>
                {!!main.upstream.length && (
                  <details className="upstream" open>
                    <summary>Earlier in the conversation</summary>
                    {main.upstream.map((post) => card(post))}
                  </details>
                )}
                {card(main.post, true)}
                {editor && (
                  <div className="thread-editor" id="thread-editor" ref={editorElement}>
                    <PostComposer
                      key={`${editor.mode}-${editor.post.id}`}
                      initial={editor.mode === 'edit' ? editor.post.text : ''}
                      label={
                        editor.mode === 'edit'
                          ? 'Edit post'
                          : `Reply to ${editor.post.owner.nickname}`
                      }
                      submitLabel={editor.mode === 'edit' ? 'Save' : 'Send reply'}
                      onDirtyChange={handleDirtyChange}
                      onCancel={() => setEditor(null)}
                      onSubmit={async (text) => {
                        await operation.mutateAsync({ ...editor, text });
                        setEditor(null);
                        await refresh();
                      }}
                    />
                  </div>
                )}
                <h2 className="section-title">Replies</h2>
                {branches.length ? (
                  <div className="reply-branches">
                    {branches.map((branch) => (
                      <div key={branch.posts[0].id} className={`reply-branch ${branch.type}`}>
                        {branch.posts.map((post) => card(post))}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted">No replies yet. Start the conversation.</p>
                )}
                {query.hasNextPage && (
                  <Button
                    variant="outline"
                    className="load-more"
                    disabled={query.isFetching}
                    onClick={() => void query.fetchNextPage()}
                  >
                    {query.isFetchingNextPage ? 'Loading…' : 'More replies'}
                  </Button>
                )}
              </>
            )
          )}
        </>
      )}
    </section>
  );
}
