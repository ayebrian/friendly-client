import { Link } from 'react-router';
import type { Person } from '../domain/models';
import { Avatar } from './feedback';
import { personPath, safeExternalLink } from './links';
import { Badge } from './ui/badge';
import { useRuntime } from './runtime';

export function PersonAvatarLink({ person }: { person: Person }) {
  const { userId } = useRuntime();
  const avatar = <Avatar name={person.nickname} file={person.avatar} />;
  return person.accessHash || person.id === userId ? (
    <Link
      className="person-avatar-link"
      aria-label={`View ${person.nickname}'s profile`}
      to={person.id === userId ? '/profile' : personPath(person)}
    >
      {avatar}
    </Link>
  ) : (
    avatar
  );
}

export function PersonLink({ person, avatar = false }: { person: Person; avatar?: boolean }) {
  const { userId } = useRuntime();
  const content = (
    <>
      {avatar && <Avatar name={person.nickname} file={person.avatar} />}
      <span>{person.nickname || 'Member'}</span>
    </>
  );
  return person.accessHash || person.id === userId ? (
    <Link className="person-link" to={person.id === userId ? '/profile' : personPath(person)}>
      {content}
    </Link>
  ) : (
    <span className="person-link">{content}</span>
  );
}

export function Interests({ items }: { items: string[] }) {
  return items.length ? (
    <ul className="interests">
      {[...new Set(items)].map((item) => (
        <li key={item}>
          <Badge variant="secondary">{item}</Badge>
        </li>
      ))}
    </ul>
  ) : (
    <p className="muted">No interests added yet.</p>
  );
}

export function SocialLink({ person }: { person: Person }) {
  const href = safeExternalLink(person.socialLink);
  return href ? (
    <a className="social-link" href={href} target="_blank" rel="noopener noreferrer">
      {new URL(href).hostname} ↗
    </a>
  ) : null;
}
