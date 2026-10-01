import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useEffect, useState } from 'react';
import { Button } from '../../shared/ui/button';
import { Textarea } from '../../shared/ui/textarea';
import { Field, FieldLabel, FieldError } from '../../shared/ui/field';
import { Markdown } from '../../shared/markdown';
import { ErrorNotice } from '../../shared/feedback';
import { errorMessage } from '../../shared/errors';
import { useUnsavedChanges } from '../../shared/use-unsaved';

const schema = z.object({ text: z.string().trim().min(1, 'Write a few words first.') });

export function PostComposer({
  initial = '',
  label = 'New post',
  submitLabel = 'Post',
  onSubmit,
  onCancel,
  onDirtyChange,
  compact = false,
}: {
  initial?: string;
  label?: string;
  submitLabel?: string;
  onSubmit: (text: string) => Promise<unknown>;
  onCancel?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  compact?: boolean;
}) {
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { text: initial } });
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState('');
  const pending = form.formState.isSubmitting;
  const dirty = form.formState.isDirty;
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);
  const guard = useUnsavedChanges(form.formState.isDirty && !pending);
  return (
    <>
      <form
        className={`composer${compact ? ' composer-compact' : ''}`}
        noValidate
        onSubmit={form.handleSubmit(async ({ text }) => {
          setError('');
          try {
            await onSubmit(text);
            form.reset({ text: '' });
          } catch (err) {
            setError(errorMessage(err));
          }
        })}
      >
        <Field data-invalid={!!form.formState.errors.text}>
          <FieldLabel htmlFor="post-text" className={compact ? 'sr-only' : undefined}>
            {label}
          </FieldLabel>
          {preview ? (
            <div className="composer-preview">
              <Markdown text={form.getValues('text') || 'Your preview will appear here.'} />
            </div>
          ) : (
            <Textarea
              id="post-text"
              className={compact ? 'composer-input' : undefined}
              rows={compact ? 2 : 5}
              placeholder="What is on your mind?"
              autoComplete="off"
              disabled={pending}
              aria-invalid={!!form.formState.errors.text}
              aria-describedby="post-text-error"
              {...form.register('text')}
            />
          )}
          <FieldError id="post-text-error" errors={[form.formState.errors.text]} />
        </Field>
        {!compact && (
          <p className="field-hint">
            Markdown supported: **bold**, [link](https://…), ![description](image URL).
          </p>
        )}
        {error && <ErrorNotice message={error} />}
        <div className="form-actions">
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => setPreview((v) => !v)}
          >
            {preview ? 'Editor' : 'Preview'}
          </Button>
          {onCancel && (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => guard.confirmDiscard(onCancel)}
            >
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={pending}>
            {pending ? 'Sending…' : submitLabel}
          </Button>
        </div>
      </form>
      {guard.confirmation}
    </>
  );
}
