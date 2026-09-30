import { PageHeader } from '../../shared/page-header';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { useRuntime } from '../../shared/runtime';
import { ErrorNotice, EmptyState, Loading } from '../../shared/feedback';
import { errorMessage } from '../../shared/errors';
import { Button } from '../../shared/ui/button';
import { PersonLink, Interests } from '../../shared/people';
import { Markdown } from '../../shared/markdown';
import { FriendActions } from '../../shared/friend-actions';
import { useOperation } from '../../shared/use-operation';

export function PeoplePage() {
  const { gateway } = useRuntime();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['discover'],
    queryFn: ({ signal }) => gateway.discover(signal),
  });
  const skip = useOperation((person: { id: number; accessHash: string }, signal) =>
    gateway.declineFriend(person.id, person.accessHash, signal),
  );
  return (
    <section className="page-content">
      <PageHeader>
        <div>
          <h1>Find your people</h1>
          <p>Meet people through shared friends and interests.</p>
        </div>
      </PageHeader>
      <div className="section-links">
        <Link to="/friends">My friends</Link>
        <Link to="/invite">Invite a friend</Link>
      </div>
      {query.isError && (
        <ErrorNotice message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      )}
      {skip.isError && <ErrorNotice message={errorMessage(skip.error)} />}
      {query.isPending ? (
        <Loading />
      ) : !query.data?.length && !query.isError ? (
        <EmptyState title="You are all caught up">
          Check back later or invite someone with a link.
        </EmptyState>
      ) : (
        <div className="people-list">
          {query.data?.map((item) => (
            <article className="person-card" key={item.details.id}>
              <div className="person-card-heading">
                <PersonLink person={item.details} avatar />
                <span className="relationship-status">
                  {item.isRequest
                    ? 'Wants to connect'
                    : item.isExtendedNetwork
                      ? 'In your extended circle'
                      : 'New to you'}
                </span>
              </div>
              <Markdown text={item.details.description} />
              <Interests items={item.details.interests} />
              {!!item.commonFriends.length && (
                <div className="common-friends">
                  <span className="muted">Mutual friends: </span>
                  {item.commonFriends.map((person) => (
                    <PersonLink key={person.id} person={person} />
                  ))}
                </div>
              )}
              <FriendActions
                person={{
                  ...item.details,
                  friendship: item.isRequest ? 'incomingRequest' : item.details.friendship,
                }}
              />
              {!item.isRequest && (
                <Button
                  variant="ghost"
                  disabled={skip.isPending}
                  onClick={() => {
                    void skip
                      .mutateAsync({ id: item.details.id, accessHash: item.details.accessHash! })
                      .then(() => client.invalidateQueries({ queryKey: ['discover'] }))
                      .catch(() => {});
                  }}
                >
                  Skip
                </Button>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function FriendsPage() {
  const { gateway } = useRuntime();
  const query = useQuery({
    queryKey: ['friends'],
    queryFn: ({ signal }) => gateway.friends(signal),
  });
  return (
    <section className="page-content">
      <PageHeader>
        <h1>My friends</h1>
        <Button asChild>
          <Link to="/invite">Invite</Link>
        </Button>
      </PageHeader>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <ErrorNotice message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : !query.data.length ? (
        <EmptyState title="Your circle starts here">
          Discover people or invite a friend with a link.
        </EmptyState>
      ) : (
        <ul className="friends-list">
          {query.data.map((person) => (
            <li key={person.id}>
              <PersonLink person={person} avatar />
              <p className="muted">{person.interests.slice(0, 4).join(' · ')}</p>
            </li>
          ))}
        </ul>
      )}
      <Link className="back-link" to="/people">
        Find new friends →
      </Link>
    </section>
  );
}
