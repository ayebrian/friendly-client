import { PageHeader } from '../../shared/page-header';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Pencil, Mail, Users } from 'lucide-react';
import { useRuntime } from '../../shared/runtime';
import { Avatar, ErrorNotice, Loading } from '../../shared/feedback';
import { Button } from '../../shared/ui/button';
import { errorMessage } from '../../shared/errors';
import { Markdown } from '../../shared/markdown';
import { Interests, SocialLink, PersonLink } from '../../shared/people';

export function ProfilePage() {
  const { gateway } = useRuntime();
  const query = useQuery({
    queryKey: ['profile'],
    queryFn: ({ signal }) => gateway.profile(signal),
  });
  const friends = useQuery({
    queryKey: ['friends'],
    queryFn: ({ signal }) => gateway.friends(signal),
  });
  return (
    <section className="page-content">
      <PageHeader>
        <h1>My profile</h1>
        <Button asChild variant="outline">
          <Link to="/profile/edit">
            <Pencil />
            Edit
          </Link>
        </Button>
      </PageHeader>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <ErrorNotice message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <div className="profile-person">
            <Avatar name={query.data.nickname} file={query.data.avatar} />
            <div>
              <h2>{query.data.nickname}</h2>
              <SocialLink person={query.data} />
            </div>
          </div>
          <Markdown
            text={
              query.data.description || 'Share a little about yourself so your people can find you.'
            }
          />
          <div className="profile-section">
            <h2>Interests</h2>
            <Interests items={query.data.interests} />
          </div>
          <div className="profile-section">
            <div className="section-heading">
              <h2>My circle</h2>
              <Link to="/friends">All friends →</Link>
            </div>
            {friends.isPending ? (
              <Loading />
            ) : friends.isError ? (
              <ErrorNotice
                message={errorMessage(friends.error)}
                onRetry={() => void friends.refetch()}
              />
            ) : friends.data.length ? (
              <ul className="friends-list">
                {friends.data.slice(0, 6).map((person) => (
                  <li key={person.id}>
                    <PersonLink person={person} avatar />
                    <p className="muted">{person.interests.slice(0, 3).join(' · ')}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Invite someone you know or find people with shared interests.</p>
            )}
            <Button asChild variant="outline">
              <Link to="/invite">
                <Users />
                Invite a friend
              </Link>
            </Button>
          </div>
          <div className="profile-section account-summary">
            <Mail />
            <div>
              <h2>Sign-in email</h2>
              <p className="muted">
                {query.data.email || 'Not linked. Add an email to keep access to your account.'}
              </p>
              <Link to="/settings">Account settings →</Link>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
