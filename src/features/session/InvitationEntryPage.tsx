import { BrandLogo } from '../../shared/brand-logo';
import { Link, useLocation } from 'react-router';
import { ArrowRight, Users } from 'lucide-react';
import { invitationReference, invitationUrl, parseInvitation } from '../../shared/links';
import { Button } from '../../shared/ui/button';
import { Alert, AlertDescription } from '../../shared/ui/alert';
import { ErrorNotice } from '../../shared/feedback';

export function InvitationEntryPage({ notice }: { notice?: string }) {
  const location = useLocation();
  const reference = invitationReference(location);
  const invitation = reference === null ? null : parseInvitation(reference);
  const hash = invitation
    ? new URL(invitationUrl(window.location.origin, invitation.userId, invitation.token)).hash
    : '';
  const returnTo = `/invite${hash}`;
  return (
    <main className="registration-layout">
      <section className="registration-panel invitation-entry">
        <Link to="/" className="wordmark" aria-label="Friendly home">
          <BrandLogo />
        </Link>
        <Users size={36} aria-hidden="true" />
        <h1>
          {invitation
            ? 'A friend invited you to Friendly'
            : reference !== null
              ? 'This invitation is not valid'
              : 'Your circle starts here'}
        </h1>
        {notice && (
          <Alert role="status">
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}
        {reference !== null && !invitation ? (
          <>
            <ErrorNotice message="Ask your friend for the full invitation link, then open it again." />
            <Button asChild variant="outline">
              <Link to="/">Back to Friendly</Link>
            </Button>
          </>
        ) : (
          <>
            <p className="muted">
              {invitation
                ? 'Create an account or sign in. Your invitation will be ready to accept once you’re in.'
                : 'Sign in to invite a friend or accept an invitation link.'}
            </p>
            <Button asChild>
              <Link to={`/signup${hash}`} state={{ returnTo }}>
                Create account <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to={`/login${hash}`} state={{ returnTo }}>
                Sign in
              </Link>
            </Button>
            <p className="field-hint">
              You choose when to accept. Opening a link does not add anyone.
            </p>
          </>
        )}
      </section>
    </main>
  );
}
