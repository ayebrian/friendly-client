import { PageHeader } from '../../shared/page-header';
import { useLocation, useNavigate } from 'react-router';
import type { FriendlyGateway } from '../../domain/gateway';
import type { Authorization } from '../../domain/models';
import { ProfileForm } from '../../shared/profile-form';

export function RegisterPage({
  gateway,
  onLogin,
}: {
  gateway: FriendlyGateway;
  onLogin: (value: Authorization) => void;
}) {
  const navigate = useNavigate();
  const state = useLocation().state as { returnTo?: string } | null;
  return (
    <main className="registration-layout">
      <section className="registration-panel">
        <a className="wordmark" href="/">
          Friendly
        </a>
        <PageHeader>
          <div>
            <h1>Let us get to know you</h1>
            <p>Create your profile. You can link a sign-in email in settings.</p>
          </div>
        </PageHeader>
        <ProfileForm
          gateway={gateway}
          submitLabel="Create account"
          onCancel={() => void navigate('/')}
          onSave={async (input, signal) => {
            const authorization = await gateway.register(input, signal);
            signal.throwIfAborted();
            onLogin(authorization);
            const destination = state?.returnTo;
            void navigate(
              destination &&
                (destination.startsWith('/redirect/') || destination.startsWith('/invite'))
                ? destination
                : '/settings',
            );
          }}
        />
      </section>
    </main>
  );
}
