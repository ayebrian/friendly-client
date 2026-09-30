import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Eye } from 'lucide-react';
import type { FriendlyGateway } from '../../domain/gateway';
import type { Authorization } from '../../domain/models';
import { errorMessage } from '../../shared/errors';
import { ErrorNotice } from '../../shared/feedback';
import { Button } from '../../shared/ui/button';
import { Input } from '../../shared/ui/input';
import { Alert, AlertDescription } from '../../shared/ui/alert';
import { Field, FieldLabel, FieldDescription, FieldError } from '../../shared/ui/field';
import { Separator } from '../../shared/ui/separator';
import { codeSchema, emailSchema } from './login-schema';

interface Props {
  gateway: FriendlyGateway;
  onLogin: (value: Authorization) => void;
  onDemo: () => void;
  notice?: string;
}

export function LoginPage({ gateway, onLogin, onDemo, notice }: Props) {
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [error, setError] = useState('');
  const emailForm = useForm({ resolver: zodResolver(emailSchema), defaultValues: { email: '' } });
  const codeForm = useForm({ resolver: zodResolver(codeSchema), defaultValues: { code: '' } });
  const pending = emailForm.formState.isSubmitting || codeForm.formState.isSubmitting;

  async function sendCode(values: { email: string }) {
    setError('');
    try {
      await gateway.sendLoginCode(values.email);
      setEmail(values.email);
      setStage('code');
    } catch (error) {
      setError(errorMessage(error));
    }
  }
  async function login(values: { code: string }) {
    setError('');
    try {
      onLogin(await gateway.login(email, values.code.replace(/\D/g, '')));
    } catch (error) {
      setError(errorMessage(error));
    }
  }

  return (
    <main className="login-layout">
      <section className="login-panel">
        <div className="login-intro">
          <a className="wordmark login-brand" href="/">
            Friendly
          </a>
          <p className="login-intro-title">
            Stories, questions, and conversations with your circle.
          </p>
          <p className="muted">Meet people through shared friends and interests.</p>
        </div>
        <div className="login-form-wrap">
          <h1>{stage === 'email' ? 'Sign in to Friendly' : 'Email code'}</h1>
          <p className="muted">
            {stage === 'email'
              ? 'Enter the email linked to your account.'
              : `Enter the code sent to ${email}.`}
          </p>
          {notice && (
            <Alert role="status" className="mb-5">
              <AlertDescription>{notice}</AlertDescription>
            </Alert>
          )}
          {stage === 'email' ? (
            <form noValidate onSubmit={emailForm.handleSubmit(sendCode)} className="login-form">
              <Field data-invalid={!!emailForm.formState.errors.email}>
                <FieldLabel htmlFor="login-email">Email address</FieldLabel>
                <Input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  spellCheck={false}
                  maxLength={2048}
                  placeholder="you@example.com"
                  aria-invalid={!!emailForm.formState.errors.email}
                  aria-describedby={emailForm.formState.errors.email ? 'email-error' : undefined}
                  {...emailForm.register('email')}
                />
                <FieldError id="email-error" errors={[emailForm.formState.errors.email]} />
              </Field>
              {error && <ErrorNotice message={error} />}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? 'Please wait…' : 'Get a code'}
                <ArrowRight />
              </Button>
            </form>
          ) : (
            <form noValidate onSubmit={codeForm.handleSubmit(login)} className="login-form">
              <Controller
                control={codeForm.control}
                name="code"
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="login-code">Email code</FieldLabel>
                    <Input
                      {...field}
                      id="login-code"
                      autoFocus
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={9}
                      placeholder="0000-0000"
                      className="tracking-widest tabular-nums"
                      aria-invalid={fieldState.invalid}
                      aria-describedby={`code-hint${fieldState.invalid ? ' code-error' : ''}`}
                      onChange={(event) => {
                        const digits = event.target.value.replace(/\D/g, '').slice(0, 8);
                        field.onChange(
                          digits.length > 4 ? `${digits.slice(0, 4)}-${digits.slice(4)}` : digits,
                        );
                      }}
                    />
                    <FieldDescription id="code-hint">
                      8 digits. The code expires in 20 minutes.
                    </FieldDescription>
                    <FieldError id="code-error" errors={[fieldState.error]} />
                  </Field>
                )}
              />
              {error && <ErrorNotice message={error} />}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? 'Please wait…' : 'Sign in'}
                <ArrowRight />
              </Button>
              <Button
                type="button"
                variant="link"
                className="min-h-11"
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
          <Separator className="my-4" />
          <div className="preview-entry">
            <Button variant="outline" className="w-full" disabled={pending} onClick={onDemo}>
              <Eye />
              Try the demo
            </Button>
            <span className="field-hint mt-2">Explore sample data without signing in.</span>
          </div>
          <p className="login-footnote">
            New here?{' '}
            <Link to="/signup" state={{ returnTo: location.pathname + location.hash }}>
              Create account
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
