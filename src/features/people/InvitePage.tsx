import { PageHeader } from '../../shared/page-header';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import QRCode from 'react-qr-code';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router';
import { useRuntime } from '../../shared/runtime';
import { useOperation } from '../../shared/use-operation';
import { invitationReference, invitationUrl, parseInvitation } from '../../shared/links';
import { Button } from '../../shared/ui/button';
import { Input } from '../../shared/ui/input';
import { Field, FieldLabel, FieldError } from '../../shared/ui/field';
import { ErrorNotice, Loading } from '../../shared/feedback';
import { errorMessage } from '../../shared/errors';
import { ConfirmAction } from '../../shared/confirm-action';

const schema = z.object({
  link: z.string().refine((v) => !!parseInvitation(v), 'Paste the full Friendly invitation link.'),
});

export function InvitePage() {
  const { gateway, userId } = useRuntime();
  const client = useQueryClient();
  const location = useLocation();
  const [showInvite, setShowInvite] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copiedLink, setCopiedLink] = useState('');
  const [copyError, setCopyError] = useState('');
  const invitationInput = useRef<HTMLInputElement>(null);
  const reference = invitationReference(location);
  const incoming = reference !== null;
  const initialLink = reference ?? '';
  const invalid = incoming && !parseInvitation(initialLink);
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { link: initialLink } });
  const query = useQuery({
    queryKey: ['invitation'],
    queryFn: ({ signal }) => gateway.invitation(false, signal),
    enabled: showInvite,
    staleTime: 0,
  });
  const regenerate = useOperation((_value: void, signal) => gateway.invitation(true, signal));
  const accept = useOperation(async (link: string, signal) => {
    const invitation = parseInvitation(link)!;
    if (invitation.userId === userId)
      throw new Error('This is your own invitation. Send it to a friend.');
    const result = await gateway.acceptInvitation(invitation.userId, invitation.token, signal);
    if (result === 'FriendTokenExpired')
      throw new Error('This invitation has expired. Ask your friend for a new link.');
  });
  const pending = accept.isPending || form.formState.isSubmitting;
  const url = query.data ? invitationUrl(window.location.origin, userId, query.data) : '';
  return (
    <section className="page-content">
      <PageHeader>
        <div>
          <h1>{incoming ? 'Accept your invitation' : 'Invite a friend'}</h1>
          <p>
            {incoming
              ? 'Add your friend to your circle on Friendly.'
              : 'Connect on Friendly with a link or QR code.'}
          </p>
        </div>
      </PageHeader>
      {!incoming &&
        (!showInvite ? (
          <Button onClick={() => setShowInvite(true)}>Create invitation</Button>
        ) : query.isPending ? (
          <Loading />
        ) : query.isError ? (
          <ErrorNotice message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : (
          <div className="invitation-block">
            <div className="qr-code">
              <QRCode value={url} size={192} title="Friendly invitation" />
            </div>
            <div className="invitation-details">
              <Field>
                <FieldLabel htmlFor="invitation-url">Your link</FieldLabel>
                <Input
                  ref={invitationInput}
                  id="invitation-url"
                  value={url}
                  readOnly
                  onFocus={(e) => e.currentTarget.select()}
                />
              </Field>
              <Button
                disabled={copying}
                onClick={async () => {
                  setCopyError('');
                  setCopying(true);
                  try {
                    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
                    await navigator.clipboard.writeText(url);
                    setCopiedLink(url);
                  } catch {
                    setCopiedLink('');
                    invitationInput.current?.focus();
                    invitationInput.current?.select();
                    setCopyError(
                      'Automatic copying is unavailable. The link is selected so you can copy it manually.',
                    );
                  } finally {
                    setCopying(false);
                  }
                }}
              >
                {copying ? 'Copying…' : copiedLink === url ? 'Copied' : 'Copy link'}
              </Button>
              <span className="sr-only" role="status">
                {copiedLink === url ? 'Link copied' : ''}
              </span>
              {copyError && <ErrorNotice message={copyError} />}
              <ConfirmAction
                title="Replace this invitation?"
                description="The previous link and QR code will stop working."
                action="Create new"
                onConfirm={async () => {
                  await client.cancelQueries({ queryKey: ['invitation'] });
                  const token = await regenerate.mutateAsync();
                  await client.cancelQueries({ queryKey: ['invitation'] });
                  client.setQueryData(['invitation'], token);
                  setCopyError('');
                }}
              >
                <Button variant="outline" disabled={regenerate.isPending}>
                  {regenerate.isPending ? 'Refreshing…' : 'Refresh invitation'}
                </Button>
              </ConfirmAction>
            </div>
          </div>
        ))}
      {invalid && (
        <ErrorNotice message="This invitation is not valid. Ask your friend for the full link." />
      )}
      <div className="profile-section">
        {!incoming && <h2>Have an invitation?</h2>}
        <form
          className="editor-form"
          noValidate
          onSubmit={form.handleSubmit(async ({ link }) => {
            try {
              await accept.mutateAsync(link);
              await Promise.all(
                ['friends', 'discover', 'person'].map((key) =>
                  client.invalidateQueries({ queryKey: [key] }),
                ),
              );
              setAccepted(true);
              if (!incoming) form.reset({ link: '' });
            } catch {
              /* error below */
            }
          })}
        >
          <Field data-invalid={!!form.formState.errors.link}>
            <FieldLabel htmlFor="invite-link">Your friend’s link</FieldLabel>
            <Input
              id="invite-link"
              autoComplete="off"
              disabled={pending}
              placeholder={`${window.location.origin}/invite#?reference=…`}
              aria-invalid={!!form.formState.errors.link}
              aria-describedby="invite-error"
              {...form.register('link', {
                onChange: () => {
                  setAccepted(false);
                  accept.reset();
                },
              })}
            />
            <FieldError id="invite-error" errors={[form.formState.errors.link]} />
          </Field>
          {accept.isError && <ErrorNotice message={errorMessage(accept.error)} />}
          {accepted && (
            <>
              <p role="status">All set. You are now friends.</p>
              <Button asChild variant="outline">
                <Link to="/friends">See your friends</Link>
              </Button>
            </>
          )}
          <Button type="submit" disabled={pending || accepted}>
            {pending ? 'Adding…' : accepted ? 'Invitation accepted' : 'Accept invitation'}
          </Button>
        </form>
      </div>
    </section>
  );
}
