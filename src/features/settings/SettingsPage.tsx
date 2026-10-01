import { PageHeader } from '../../shared/page-header';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useRuntime } from '../../shared/runtime';
import { useOperation } from '../../shared/use-operation';
import { usePreferences } from '../../shared/preferences';
import { Button } from '../../shared/ui/button';
import { Input } from '../../shared/ui/input';
import { EmailCodeInput } from '../../shared/email-code-input';
import { Field, FieldLabel, FieldError } from '../../shared/ui/field';
import { ConfirmAction } from '../../shared/confirm-action';
import { ErrorNotice, Loading } from '../../shared/feedback';
import { errorMessage } from '../../shared/errors';

const emailSchema = z.object({ email: z.email('Enter a valid email address.') });
const codeSchema = z.object({
  code: z.string().regex(/^\d{8}$/, 'Enter the 8-digit code from your email.'),
});

export function SettingsPage() {
  const { gateway, isDemo, enablePush, disablePush } = useRuntime();
  const { theme, setTheme } = usePreferences();
  const client = useQueryClient();
  const profile = useQuery({
    queryKey: ['profile'],
    queryFn: ({ signal }) => gateway.profile(signal),
  });
  const [sentTo, setSentTo] = useState('');
  const [pushEnabled, setPushEnabled] = useState(false);
  const emailForm = useForm({ resolver: zodResolver(emailSchema), defaultValues: { email: '' } });
  const codeForm = useForm({ resolver: zodResolver(codeSchema), defaultValues: { code: '' } });
  const link = useOperation((email: string, signal) => gateway.linkEmail(email, signal));
  const confirm = useOperation((code: string, signal) => gateway.confirmEmail(code, signal));
  const unlink = useOperation((_value: void, signal) => gateway.unlinkEmail(signal));
  const push = useOperation(async (enabled: boolean) => {
    if (enabled) await enablePush();
    else await disablePush();
  });
  const pending = link.isPending || confirm.isPending || unlink.isPending;
  return (
    <section className="page-content settings-page">
      <PageHeader>
        <h1>Settings</h1>
      </PageHeader>
      <section className="settings-section">
        <h2>Sign-in email</h2>
        <p className="muted">An email code lets you sign in on another device.</p>
        {profile.isPending ? (
          <Loading />
        ) : profile.isError ? (
          <ErrorNotice
            message={errorMessage(profile.error)}
            onRetry={() => void profile.refetch()}
          />
        ) : (
          <>
            <p className="current-email">{profile.data.email || 'No email linked yet'}</p>
            {profile.data.email && (
              <ConfirmAction
                title="Unlink your email?"
                description="Email sign-in will stop working. Link another email before signing out to keep access to your account."
                action="Unlink"
                onConfirm={async () => {
                  await unlink.mutateAsync();
                  await client.invalidateQueries({ queryKey: ['profile'] });
                  toast.success('Email unlinked');
                }}
              >
                <Button variant="outline" disabled={pending}>
                  Unlink email
                </Button>
              </ConfirmAction>
            )}
            {!sentTo ? (
              <form
                className="editor-form"
                noValidate
                onSubmit={emailForm.handleSubmit(async ({ email }) => {
                  try {
                    await link.mutateAsync(email);
                    setSentTo(email);
                  } catch {
                    /* Inline error. */
                  }
                })}
              >
                <Field data-invalid={!!emailForm.formState.errors.email}>
                  <FieldLabel htmlFor="settings-email">
                    {profile.data.email ? 'New email' : 'Email address'}
                  </FieldLabel>
                  <Input
                    id="settings-email"
                    type="email"
                    autoComplete="email"
                    spellCheck={false}
                    disabled={pending}
                    aria-invalid={!!emailForm.formState.errors.email}
                    aria-describedby="settings-email-error"
                    {...emailForm.register('email')}
                  />
                  <FieldError
                    id="settings-email-error"
                    errors={[emailForm.formState.errors.email]}
                  />
                </Field>
                {link.isError && <ErrorNotice message={errorMessage(link.error)} />}
                <Button type="submit" disabled={pending}>
                  {link.isPending ? 'Sending…' : 'Send code'}
                </Button>
              </form>
            ) : (
              <form
                className="editor-form"
                noValidate
                onSubmit={codeForm.handleSubmit(async ({ code }) => {
                  try {
                    await confirm.mutateAsync(code);
                    setSentTo('');
                    codeForm.reset();
                    emailForm.reset();
                    await client.invalidateQueries({ queryKey: ['profile'] });
                    toast.success('Email verified');
                  } catch {
                    /* Inline error. */
                  }
                })}
              >
                <p>
                  A code was sent to {sentTo}.{isDemo ? ' Demo code: 12345678.' : ''}
                </p>
                <Field data-invalid={!!codeForm.formState.errors.code}>
                  <FieldLabel htmlFor="email-code">Verification code</FieldLabel>
                  <Controller
                    control={codeForm.control}
                    name="code"
                    render={({ field, fieldState }) => (
                      <EmailCodeInput
                        {...field}
                        id="email-code"
                        disabled={pending}
                        aria-invalid={fieldState.invalid}
                        aria-describedby="email-code-error"
                      />
                    )}
                  />
                  <FieldError id="email-code-error" errors={[codeForm.formState.errors.code]} />
                </Field>
                {confirm.isError && <ErrorNotice message={errorMessage(confirm.error)} />}
                <div className="inline-actions">
                  <Button type="submit" disabled={pending}>
                    {confirm.isPending ? 'Verifying…' : 'Verify email'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending}
                    onClick={() => {
                      setSentTo('');
                      codeForm.reset();
                      confirm.reset();
                    }}
                  >
                    Change email
                  </Button>
                </div>
              </form>
            )}
          </>
        )}
      </section>
      <section className="settings-section">
        <h2>Appearance</h2>
        <div className="inline-actions" role="group" aria-label="Color theme">
          {(['system', 'light', 'dark'] as const).map((value) => (
            <Button
              key={value}
              variant={theme === value ? 'secondary' : 'outline'}
              aria-pressed={theme === value}
              onClick={() => setTheme(value)}
            >
              {{ system: 'System', light: 'Light', dark: 'Dark' }[value]}
            </Button>
          ))}
        </div>
      </section>
      <section className="settings-section">
        <h2>Browser notifications</h2>
        <p className="muted">
          Activity updates automatically while the app is open. Push notifications let you know when
          something happens while you are away.
        </p>
        {isDemo ? (
          <p className="demo-note">
            Push is unavailable in the demo. Use Add activity to try an incoming notification.
          </p>
        ) : (
          <>
            <div className="inline-actions">
              <Button
                disabled={push.isPending}
                onClick={() => {
                  void push
                    .mutateAsync(true)
                    .then(() => {
                      setPushEnabled(true);
                      toast.success('Notifications enabled');
                    })
                    .catch(() => {});
                }}
              >
                {push.isPending ? 'Please wait…' : 'Enable notifications'}
              </Button>
              <Button
                variant="outline"
                disabled={push.isPending}
                onClick={() => {
                  void push
                    .mutateAsync(false)
                    .then(() => {
                      setPushEnabled(false);
                      toast.success('Notifications disabled');
                    })
                    .catch(() => {});
                }}
              >
                Disable
              </Button>
            </div>
            {pushEnabled && <p role="status">Notifications are enabled on this device.</p>}
            {push.isError && <ErrorNotice message={errorMessage(push.error)} />}
          </>
        )}
      </section>
    </section>
  );
}
