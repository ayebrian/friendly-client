import { Link } from 'react-router';
import { MoreHorizontal, Pencil, Reply, Trash2 } from 'lucide-react';
import type { Post } from '../../domain/models';
import { Avatar } from '../../shared/feedback';
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
  openThread = false,
  beforeOpen,
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
  openThread?: boolean;
  beforeOpen?: () => boolean;
}) {
  const { userId } = useRuntime();
  const participants = (post.replyPreviews ?? [])
    .filter((person, index, all) => all.findIndex((p) => p.id === person.id) === index)
    .slice(0, 3);
  const canOpen = openThread && !post.deleted;
  return (
    <article
      id={anchorId}
      tabIndex={anchorId ? -1 : undefined}
      className={`post-card${main ? ' main-post' : ''}${post.deleted ? ' deleted-post' : ''}${
        canOpen ? ' openable' : ''
      }`}
    >
      {canOpen && (
        <Link
          className="post-open"
          to={postPath(post)}
          aria-label={`Open ${post.owner.nickname}'s post in a thread`}
          onClick={(event) => {
            // Keep text selection from turning into navigation.
            if (window.getSelection()?.toString()) event.preventDefault();
            else if (beforeOpen && !beforeOpen()) event.preventDefault();
          }}
        />
      )}
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
        {!post.deleted && (
          <footer className="post-footer">
            {onReply ? (
              <Button variant="ghost" onClick={onReply} disabled={busy}>
                <Reply />
                Reply
              </Button>
            ) : (
              <Button asChild variant="ghost">
                <Link to={postPath(post)} state={{ reply: true }}>
                  <Reply />
                  Reply
                </Link>
              </Button>
            )}
            {!!participants.length && (
              <span
                className="reply-participants"
                title={`${participants.map((p) => p.nickname).join(', ')} in this thread`}
                aria-label={`${participants.map((p) => p.nickname).join(', ')} replied`}
              >
                {participants.map((person) => (
                  <Avatar key={person.id} name={person.nickname} file={person.avatar} />
                ))}
              </span>
            )}
          </footer>
        )}
      </div>
    </article>
  );
}
