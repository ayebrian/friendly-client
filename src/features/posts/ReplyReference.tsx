import { Link } from 'react-router';
import { CornerUpLeft } from 'lucide-react';
import type { Post } from '../../domain/models';
import { postPath } from '../../shared/links';
import { MarkdownExcerpt } from '../../shared/markdown';

export function ReplyReference({ post, targetId }: { post: Post; targetId?: string }) {
  return (
    <Link
      className="reply-context"
      to={postPath(post)}
      onClick={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
          return;
        const target = targetId && document.getElementById(targetId);
        if (!target) return;
        event.preventDefault();
        const upstream = target.closest('details');
        if (upstream) upstream.open = true;
        target.scrollIntoView({ block: 'start' });
        target.focus({ preventScroll: true });
      }}
    >
      <span className="reply-context-label">
        <CornerUpLeft aria-hidden="true" />
        <span>
          Replying to <strong>{post.deleted ? 'a deleted post' : post.owner.nickname}</strong>
        </span>
      </span>
      {post.deleted ? (
        <span className="reply-excerpt">Original message deleted</span>
      ) : post.text.trim() ? (
        <MarkdownExcerpt text={post.text} />
      ) : (
        <span className="reply-excerpt">Original message has no text</span>
      )}
    </Link>
  );
}
