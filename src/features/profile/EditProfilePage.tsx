import { PageHeader } from '../../shared/page-header';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useRuntime } from '../../shared/runtime';
import { ProfileForm } from '../../shared/profile-form';
import { ErrorNotice, Loading } from '../../shared/feedback';
import { errorMessage } from '../../shared/errors';

export function EditProfilePage() {
  const { gateway } = useRuntime();
  const navigate = useNavigate();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['profile'],
    queryFn: ({ signal }) => gateway.profile(signal),
  });
  return (
    <section className="page-content">
      <PageHeader backTo="/profile" backLabel="Back to profile">
        <h1>Edit profile</h1>
      </PageHeader>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <ErrorNotice message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : (
        <ProfileForm
          gateway={gateway}
          person={query.data}
          submitLabel="Save profile"
          onCancel={() => void navigate('/profile')}
          onSave={async (input, signal) => {
            await gateway.editProfile(input, signal);
            signal.throwIfAborted();
            await Promise.all(
              ['profile', 'posts', 'thread', 'activity'].map((key) =>
                client.invalidateQueries({ queryKey: [key] }),
              ),
            );
            if (!signal.aborted) {
              toast.success('Profile updated');
              void navigate('/profile');
            }
          }}
        />
      )}
    </section>
  );
}
