import { Link } from 'react-router';
import { MessageCircle, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import type { Post } from '../../domain/models';
import { Markdown } from '../../shared/markdown';
import { PersonLink, PersonAvatarLink } from '../../shared/people';
import { postPath } from '../../shared/links';
import { Button } from '../../shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '../../shared/ui/dropdown-menu';
import { ConfirmAction } from '../../shared/confirm-action';
import { useRuntime } from '../../shared/runtime';
import { ReplyReference } from './ReplyReference';

const date = new Intl.DateTimeFormat('en', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export function PostCard({
  post,
  main = false,
  onReply,
  onEdit,
  onDelete,
  busy = false,
  replyTo,
  anchorId,
  replyTargetId,
}: {
  post: Post;
  main?: boolean;
  onReply?: () => void;
  onEdit?: () => void;
  onDelete?: () => Promise<unknown>;
  busy?: boolean;
  replyTo?: Post;
  anchorId?: string;
  replyTargetId?: string;
}) {
  const { userId } = useRuntime();
  const participants = [...new Set(post.replyPreviews?.map((p) => p.nickname))]
    .slice(0, 3)
    .join(', ');
  const threadPreview = `${participants} in this thread`;
  return (
    <article
      id={anchorId}
      tabIndex={anchorId ? -1 : undefined}
      className={`post-card${main ? ' main-post' : ''}${post.deleted ? ' deleted-post' : ''}`}
    >
      {!post.deleted && (
        <div className="post-avatar">
          <PersonAvatarLink person={post.owner} />
        </div>
      )}
      <div className="post-content">
        <header className="post-header">
          {post.deleted ? (
            <span className="muted">Post deleted</span>
          ) : (
            <PersonLink person={post.owner} />
          )}
          <div className="post-meta">
            <time dateTime={post.instant}>{date.format(new Date(post.instant))}</time>
            {post.edited && <span>edited</span>}
          </div>
          {!post.deleted && userId === post.owner.id && onEdit && onDelete && (
            <div className="post-options">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Post options" disabled={busy}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={onEdit} disabled={busy}>
                    <Pencil />
                    Edit
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <ConfirmAction
                title="Delete this post?"
                description="The post will be deleted. Other people’s replies will stay in the thread."
                action="Delete"
                onConfirm={onDelete}
              >
                <Button variant="ghost" size="icon" aria-label="Delete post" disabled={busy}>
                  <Trash2 />
                </Button>
              </ConfirmAction>
            </div>
          )}
        </header>
        {replyTo && <ReplyReference post={replyTo} targetId={replyTargetId} />}
        {!post.deleted && <Markdown text={post.text} />}
        <footer className="post-footer">
          {onReply && !post.deleted && (
            <Button variant="ghost" onClick={onReply} disabled={busy}>
              <MessageCircle />
              Reply
            </Button>
          )}
          {!main && (
            <Button asChild variant="link">
              <Link to={postPath(post)}>
                <MessageCircle />
                {post.replyPreviews?.length ? 'Read thread' : 'Open thread'}
              </Link>
            </Button>
          )}
          {!!post.replyPreviews?.length && (
            <span className="muted reply-preview" title={threadPreview}>
              {threadPreview}
            </span>
          )}
        </footer>
      </div>
    </article>
  );
}
