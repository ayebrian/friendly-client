import { BrandLogo } from '../../shared/brand-logo';
import { PageHeader } from '../../shared/page-header';
import { Link, useLocation, useNavigate } from 'react-router';
import type { FriendlyGateway } from '../../domain/gateway';
import type { Authorization } from '../../domain/models';
import { signInDestination } from '../../shared/links';
import { ProfileForm } from '../../shared/profile-form';

export function RegisterPage({
  gateway,
  onLogin,
}: {
  gateway: FriendlyGateway;
  onLogin: (value: Authorization) => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const destination = signInDestination(location, '/settings');
  return (
    <main className="registration-layout">
      <section className="registration-panel">
        <Link className="wordmark" to="/" aria-label="Friendly home">
          <BrandLogo />
        </Link>
        <PageHeader>
          <div>
            <h1>Let us get to know you</h1>
            <p>Create your profile. You can link a sign-in email in settings.</p>
          </div>
        </PageHeader>
        <p className="login-footnote">
          Already have an account?{' '}
          <Link to={`/login${location.hash}`} state={{ returnTo: destination }}>
            Sign in
          </Link>
        </p>
        <ProfileForm
          gateway={gateway}
          submitLabel="Create account"
          onCancel={() => void navigate('/')}
          onSave={async (input, signal) => {
            const authorization = await gateway.register(input, signal);
            signal.throwIfAborted();
            onLogin(authorization);
            void navigate(destination, { replace: true });
          }}
        />
      </section>
    </main>
  );
}
