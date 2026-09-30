import { useState } from 'react';
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
        <a className="wordmark login-brand" href="/">
          Friendly
        </a>
        <div className="login-form-wrap">
          <h1>{stage === 'email' ? 'Вход в Friendly' : 'Код из письма'}</h1>
          <p className="muted">
            {stage === 'email'
              ? 'Введите почту, привязанную к вашему аккаунту.'
              : `Введите код из письма на ${email}.`}
          </p>
          {notice && (
            <Alert role="status" className="mb-5">
              <AlertDescription>{notice}</AlertDescription>
            </Alert>
          )}
          {stage === 'email' ? (
            <form noValidate onSubmit={emailForm.handleSubmit(sendCode)} className="login-form">
              <Field data-invalid={!!emailForm.formState.errors.email}>
                <FieldLabel htmlFor="login-email">Электронная почта</FieldLabel>
                <Input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  maxLength={2048}
                  placeholder="you@example.com"
                  className="h-12"
                  aria-invalid={!!emailForm.formState.errors.email}
                  aria-describedby={emailForm.formState.errors.email ? 'email-error' : undefined}
                  {...emailForm.register('email')}
                />
                <FieldError id="email-error" errors={[emailForm.formState.errors.email]} />
              </Field>
              {error && <ErrorNotice message={error} />}
              <Button type="submit" size="lg" className="w-full" disabled={pending}>
                {pending ? 'Подождите…' : 'Получить код'}
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
                    <FieldLabel htmlFor="login-code">Код из письма</FieldLabel>
                    <Input
                      {...field}
                      id="login-code"
                      autoFocus
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={9}
                      placeholder="0000-0000"
                      className="h-12 tracking-widest tabular-nums"
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
                      8 цифр. Код действует 20 минут.
                    </FieldDescription>
                    <FieldError id="code-error" errors={[fieldState.error]} />
                  </Field>
                )}
              />
              {error && <ErrorNotice message={error} />}
              <Button type="submit" size="lg" className="w-full" disabled={pending}>
                {pending ? 'Подождите…' : 'Войти'}
                <ArrowRight />
              </Button>
              <Button
                type="button"
                variant="link"
                className="h-auto min-h-11 whitespace-normal"
                disabled={pending}
                onClick={() => {
                  setStage('email');
                  codeForm.reset();
                  setError('');
                }}
              >
                Изменить почту / отправить код снова
              </Button>
            </form>
          )}
          <Separator className="my-7" />
          <div className="preview-entry">
            <Button
              variant="outline"
              size="lg"
              className="w-full"
              disabled={pending}
              onClick={onDemo}
            >
              <Eye />
              Открыть демонстрацию
            </Button>
            <span className="field-hint mt-3">Демо с примерами данных, без входа в аккаунт.</span>
          </div>
          <p className="login-footnote">
            Для входа почта должна быть привязана к аккаунту в Friendly.
          </p>
        </div>
      </section>
    </main>
  );
}
