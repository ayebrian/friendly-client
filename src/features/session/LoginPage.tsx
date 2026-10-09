import { ProjectLinks } from '../../shared/project-links';
import { BrandLogo } from '../../shared/brand-logo';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { FriendlyGateway } from '../../domain/gateway';
import type { Authorization } from '../../domain/models';
import { errorMessage } from '../../shared/errors';
import { ErrorNotice } from '../../shared/feedback';
import { Button } from '../../shared/ui/button';
import { Input } from '../../shared/ui/input';
import { EmailCodeInput } from '../../shared/email-code-input';
import { Alert, AlertDescription } from '../../shared/ui/alert';
import { Field, FieldLabel, FieldDescription, FieldError } from '../../shared/ui/field';
import { signInDestination } from '../../shared/links';
import { codeSchema, emailSchema } from './login-schema';

const inputClassName =
  'h-12 px-3 text-base md:text-base border-muted-foreground bg-background dark:bg-background focus-visible:border-[var(--color-link)] focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-link)]';
const submitClassName = 'w-full h-12 px-4 text-sm [&_svg]:size-4';

interface Props {
  gateway: FriendlyGateway;
  onLogin: (value: Authorization) => void;
  notice?: string;
}

export function LoginPage({ gateway, onLogin, notice }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const destination = signInDestination(location);
  const [email, setEmail] = useState('');
  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [error, setError] = useState('');
  const [lifetime] = useState(() => ({ current: new AbortController() }));
  useEffect(() => {
    lifetime.current = new AbortController();
    return () => lifetime.current.abort();
  }, [lifetime]);
  const emailForm = useForm({ resolver: zodResolver(emailSchema), defaultValues: { email: '' } });
  const codeForm = useForm({ resolver: zodResolver(codeSchema), defaultValues: { code: '' } });
  const pending = emailForm.formState.isSubmitting || codeForm.formState.isSubmitting;

  async function sendCode(values: { email: string }) {
    const signal = lifetime.current.signal;
    setError('');
    try {
      await gateway.sendLoginCode(values.email, signal);
      signal.throwIfAborted();
      setEmail(values.email);
      setStage('code');
    } catch (error) {
      if (!signal.aborted) setError(errorMessage(error));
    }
  }
  async function login(values: { code: string }) {
    const signal = lifetime.current.signal;
    setError('');
    try {
      const authorization = await gateway.login(email, values.code.replace(/\D/g, ''), signal);
      signal.throwIfAborted();
      onLogin(authorization);
      void navigate(destination, { replace: true });
    } catch (error) {
      if (!signal.aborted) setError(errorMessage(error));
    }
  }

  return (
    <div className="login-layout">
      <header className="login-header">
        <Link className="wordmark login-brand" to="/" aria-label="Friendly home">
          <BrandLogo />
        </Link>
        <Button
          asChild
          variant="ghost"
          className="ml-auto min-h-11 px-3 text-sm text-muted-foreground max-sm:px-2 max-sm:text-[0.8125rem]"
        >
          <Link to="/">
            <ArrowLeft /> Back to home
          </Link>
        </Button>
      </header>
      <main className="login-panel" aria-labelledby="login-title">
        <div className="login-form-wrap">
          <div className="login-heading">
            <h1 id="login-title">
              {stage === 'email' ? 'Sign in to Friendly' : 'Check your email'}
            </h1>
            <p className="muted">
              {stage === 'email' ? (
                'Use the email linked to your account. We’ll send you a sign-in code.'
              ) : (
                <>
                  We sent an 8-digit code to <strong>{email}</strong>.
                </>
              )}
            </p>
          </div>
          {notice && (
            <Alert role="status" className="p-3">
              <AlertDescription className="text-sm">{notice}</AlertDescription>
            </Alert>
          )}
          {stage === 'email' ? (
            <form
              noValidate
              onSubmit={emailForm.handleSubmit(sendCode)}
              className="login-form"
              aria-busy={pending}
            >
              <Field data-invalid={!!emailForm.formState.errors.email}>
                <FieldLabel htmlFor="login-email" className="text-sm">
                  Email address
                </FieldLabel>
                <Input
                  className={inputClassName}
                  id="login-email"
                  type="email"
                  readOnly={pending}
                  autoCapitalize="none"
                  autoComplete="email"
                  spellCheck={false}
                  maxLength={2048}
                  placeholder="you@example.com"
                  aria-invalid={!!emailForm.formState.errors.email}
                  aria-describedby={emailForm.formState.errors.email ? 'email-error' : undefined}
                  {...emailForm.register('email')}
                />
                <FieldError
                  className="text-sm leading-normal"
                  id="email-error"
                  errors={[emailForm.formState.errors.email]}
                />
              </Field>
              {error && (
                <ErrorNotice
                  message={error}
                  className="my-0 p-3 [&_[data-slot=alert-description]]:text-sm [&_svg]:size-4"
                />
              )}
              <Button type="submit" className={submitClassName} disabled={pending}>
                {pending ? 'Sending code…' : 'Get a code'}
                {!pending && <ArrowRight />}
              </Button>
            </form>
          ) : (
            <form
              noValidate
              onSubmit={codeForm.handleSubmit(login)}
              className="login-form"
              aria-busy={pending}
            >
              <Controller
                control={codeForm.control}
                name="code"
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="login-code" className="text-sm">
                      Email code
                    </FieldLabel>
                    <EmailCodeInput
                      {...field}
                      className={inputClassName}
                      id="login-code"
                      autoFocus
                      readOnly={pending}
                      aria-invalid={fieldState.invalid}
                      aria-describedby={`code-hint${fieldState.invalid ? ' code-error' : ''}`}
                    />
                    <FieldDescription className="text-sm leading-normal" id="code-hint">
                      8 digits. The code expires in 20 minutes.
                    </FieldDescription>
                    <FieldError
                      className="text-sm leading-normal"
                      id="code-error"
                      errors={[fieldState.error]}
                    />
                  </Field>
                )}
              />
              {error && (
                <ErrorNotice
                  message={error}
                  className="my-0 p-3 [&_[data-slot=alert-description]]:text-sm [&_svg]:size-4"
                />
              )}
              <Button type="submit" className={submitClassName} disabled={pending}>
                {pending ? 'Signing in…' : 'Sign in'}
                {!pending && <ArrowRight />}
              </Button>
              <Button
                type="button"
                variant="link"
                className="min-h-12 px-4 text-sm text-[var(--color-link)] underline underline-offset-4"
                disabled={pending}
                onClick={() => {
                  setStage('email');
                  codeForm.reset();
                  setError('');
                }}
              >
                Change email
              </Button>
            </form>
          )}
          <p className="login-footnote">
            New here?{' '}
            <Link to={`/signup${location.hash}`} state={{ returnTo: destination }}>
              Create account
            </Link>
          </p>
        </div>
      </main>
      <footer className="login-footer" aria-label="Project links">
        <ProjectLinks />
      </footer>
    </div>
  );
}
