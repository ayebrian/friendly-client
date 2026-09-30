import { useQuery } from '@tanstack/react-query';
import { useRuntime } from '../../shared/runtime';
import { Avatar, ErrorNotice, Loading } from '../../shared/feedback';
import { Badge } from '../../shared/ui/badge';
import { errorMessage } from '../../shared/errors';

export function ProfilePage() {
  const { gateway } = useRuntime();
  const query = useQuery({
    queryKey: ['profile'],
    queryFn: ({ signal }) => gateway.profile(signal),
  });
  return (
    <section className="page-content">
      <header className="page-heading">
        <div>
          <h1>Мой профиль</h1>
        </div>
      </header>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <ErrorNotice message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : (
        <div className="profile-content">
          <div className="profile-person">
            <Avatar name={query.data.nickname} />
            <h2>{query.data.nickname}</h2>
          </div>
          <p>{query.data.description || 'Описание пока не добавлено.'}</p>
          <ul className="interests">
            {query.data.interests.map((interest) => (
              <li key={interest}>
                <Badge variant="outline">{interest}</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
