import { useQuery } from '@tanstack/react-query';
import { Navigate, useParams } from 'react-router';
import { PageHeader } from '../../shared/page-header';
import { useRuntime } from '../../shared/runtime';
import { Avatar, ErrorNotice, Loading } from '../../shared/feedback';
import { Interests, SocialLink, PersonLink } from '../../shared/people';
import { Markdown } from '../../shared/markdown';
import { FriendActions } from '../../shared/friend-actions';
import { errorMessage } from '../../shared/errors';

export function PersonPage() {
  const { id, hash } = useParams();
  const { gateway, userId } = useRuntime();
  const personId = Number(id);
  const valid = Number.isSafeInteger(personId) && personId > 0 && !!hash;
  const query = useQuery({
    queryKey: ['person', personId, hash],
    queryFn: ({ signal }) => gateway.person(personId, hash!, signal),
    enabled: valid && personId !== userId,
  });
  if (personId === userId) return <Navigate to="/profile" replace />;
  return (
    <section className="page-content">
      <PageHeader backTo="/people" backLabel="Back to people">
        <h1>Profile</h1>
      </PageHeader>
      {!valid ? (
        <ErrorNotice message="This profile link is incomplete. Open the person from your friends or a post." />
      ) : query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <ErrorNotice message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <div className="profile-person">
            <Avatar name={query.data.user.nickname} file={query.data.user.avatar} />
            <div>
              <h2>{query.data.user.nickname}</h2>
              <SocialLink person={query.data.user} />
            </div>
          </div>
          <Markdown text={query.data.user.description} />
          <div className="profile-section">
            <h2>Interests</h2>
            <Interests items={query.data.user.interests} />
          </div>
          <FriendActions person={query.data.user} />
          {!!query.data.commonFriends.length && (
            <div className="profile-section">
              <h2>Mutual friends</h2>
              <ul className="friends-list">
                {query.data.commonFriends.map((person) => (
                  <li key={person.id}>
                    <PersonLink person={person} avatar />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
