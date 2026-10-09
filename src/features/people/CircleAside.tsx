import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { PersonLink } from '../../shared/people';
import { useRuntime } from '../../shared/runtime';
import { Button } from '../../shared/ui/button';

export function CircleAside() {
  const { gateway } = useRuntime();
  // Observe the existing account cache. The friends/profile screens own loading it.
  const friends = useQuery({
    queryKey: ['friends'],
    queryFn: ({ signal }) => gateway.friends(signal),
    enabled: false,
  });
  return (
    <aside className="context-column" aria-label="Your circle">
      <section className="context-section">
        <h2>Your circle</h2>
        {friends.data?.length ? (
          <ul className="context-people">
            {friends.data.slice(0, 4).map((person) => (
              <li key={person.id}>
                <PersonLink person={person} avatar />
                <p className="muted">{person.interests.slice(0, 2).join(' · ')}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Find people through shared interests and friends.</p>
        )}
        <Link className="context-link" to={friends.data?.length ? '/friends' : '/people'}>
          {friends.data?.length ? 'View all friends' : 'Discover people'} →
        </Link>
      </section>
      <section className="context-section">
        <h2>Bring a friend</h2>
        <p className="muted">Share an invitation and keep the conversation going.</p>
        <Button asChild variant="outline">
          <Link to="/invite">Invite a friend</Link>
        </Button>
      </section>
      <div className="context-footer">
        <Link to="/settings">Settings</Link>
        <a href="https://getfriend.ly" target="_blank" rel="noreferrer">
          Friendly ↗
        </a>
      </div>
    </aside>
  );
}
