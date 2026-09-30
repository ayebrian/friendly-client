import { useEffect, useId, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { FriendlyGateway } from '../domain/gateway';
import type { Person, ProfileInput } from '../domain/models';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Field, FieldLabel, FieldDescription, FieldError } from './ui/field';
import { ErrorNotice } from './feedback';
import { errorMessage } from './errors';
import { safeExternalLink } from './links';
import { useUnsavedChanges } from './use-unsaved';

export const profileSchema = z.object({
  nickname: z
    .string()
    .trim()
    .min(1, 'Enter your name.')
    .max(256, 'Use no more than 256 characters.'),
  description: z
    .string()
    .trim()
    .min(1, 'Tell us a little about yourself.')
    .max(1024, 'Use no more than 1024 characters.'),
  socialLink: z
    .string()
    .trim()
    .max(2048, 'This link is too long.')
    .refine(
      (v) => !v || !!safeExternalLink(v),
      'Enter a website link starting with http or https.',
    ),
  interests: z.string().refine((v) => {
    if (!v.trim()) return true;
    const items = v.split(',').map((x) => x.trim());
    return (
      items.length <= 100 &&
      new Set(items).size === items.length &&
      items.every((x) => x.length > 0 && x.length <= 64)
    );
  }, 'Add up to 100 unique interests, separated by commas, with 1–64 characters each.'),
});

export function ProfileForm({
  gateway,
  person,
  submitLabel,
  onSave,
  onCancel,
}: {
  gateway: FriendlyGateway;
  person?: Person;
  submitLabel: string;
  onSave: (input: ProfileInput, signal: AbortSignal) => Promise<void>;
  onCancel: () => void;
}) {
  const prefix = useId();
  const [file, setFile] = useState<File | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [fileError, setFileError] = useState('');
  const avatarInput = useRef<HTMLInputElement>(null);
  const [controller] = useState(() => ({ current: new AbortController() }));
  useEffect(() => {
    controller.current = new AbortController();
    return () => controller.current.abort();
  }, [controller]);
  useEffect(() => {
    if (!file) {
      setPreview('');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const form = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      nickname: person?.nickname ?? '',
      description: person?.description ?? '',
      interests: person?.interests.join(', ') ?? '',
      socialLink: person?.socialLink ?? '',
    },
  });
  const pending = form.formState.isSubmitting;
  const dirty = form.formState.isDirty || !!file || removeAvatar;
  useUnsavedChanges(dirty && !pending);
  const avatarUrl =
    preview || (!removeAvatar && person?.avatar ? gateway.fileUrl(person.avatar) : '');
  return (
    <form
      className="editor-form"
      noValidate
      onSubmit={form.handleSubmit(async (values) => {
        if (fileError) return;
        setError('');
        const signal = controller.current.signal;
        try {
          const avatar = file
            ? await gateway.uploadAvatar(file, !person, signal)
            : removeAvatar
              ? null
              : (person?.avatar ?? null);
          signal.throwIfAborted();
          await onSave(
            {
              ...values,
              interests: values.interests.trim()
                ? values.interests.split(',').map((v) => v.trim())
                : [],
              socialLink: values.socialLink ? safeExternalLink(values.socialLink)! : null,
              avatar,
            },
            signal,
          );
        } catch (err) {
          if (!signal.aborted) setError(errorMessage(err));
        }
      })}
    >
      <div className="avatar-editor">
        <div className="avatar-preview">
          {avatarUrl ? (
            <img src={avatarUrl} alt="Your avatar" width={80} height={80} />
          ) : (
            <span aria-hidden="true">{person?.nickname[0] ?? '+'}</span>
          )}
        </div>
        <Field>
          <FieldLabel htmlFor={`${prefix}-avatar`}>Photo</FieldLabel>
          <Input
            ref={avatarInput}
            id={`${prefix}-avatar`}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            disabled={pending}
            aria-invalid={!!fileError}
            aria-describedby={`${prefix}-avatar-help`}
            onChange={(event) => {
              const selected = event.target.files?.[0];
              if (!selected) return;
              if (
                !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(selected.type) ||
                selected.size > 5_000_000
              ) {
                setFileError('Choose a JPG, PNG, WebP, or GIF up to 5 MB.');
                event.target.value = '';
                return;
              }
              setFileError('');
              setFile(selected);
              setRemoveAvatar(false);
            }}
          />
          <FieldDescription id={`${prefix}-avatar-help`}>
            {fileError || 'JPG, PNG, WebP, or GIF, up to 5 MB.'}
          </FieldDescription>
          {fileError && (
            <Button
              type="button"
              variant="link"
              disabled={pending}
              onClick={() => {
                setFileError('');
                setFile(null);
                setRemoveAvatar(false);
                if (avatarInput.current) avatarInput.current.value = '';
              }}
            >
              Clear file selection
            </Button>
          )}
          {(file || (person?.avatar && !removeAvatar)) && (
            <Button
              type="button"
              variant="link"
              disabled={pending}
              onClick={() => {
                setFile(null);
                setRemoveAvatar(true);
                setFileError('');
                if (avatarInput.current) avatarInput.current.value = '';
              }}
            >
              Remove photo
            </Button>
          )}
        </Field>
      </div>
      {(['nickname', 'description', 'interests', 'socialLink'] as const).map((name) => {
        const labels = {
          nickname: 'Name',
          description: 'About you',
          interests: 'Interests',
          socialLink: 'Contact link',
        };
        const props = {
          ...form.register(name),
          id: `${prefix}-${name}`,
          disabled: pending,
          'aria-invalid': !!form.formState.errors[name],
          'aria-describedby': `${prefix}-${name}-error`,
          autoComplete: 'off',
        };
        return (
          <Field key={name} data-invalid={!!form.formState.errors[name]}>
            <FieldLabel htmlFor={props.id}>{labels[name]}</FieldLabel>
            {name === 'description' ? (
              <Textarea
                {...props}
                rows={4}
                maxLength={1024}
                placeholder="What are you interested in? Who would you like to meet?"
              />
            ) : (
              <Input
                {...props}
                maxLength={name === 'nickname' ? 256 : name === 'socialLink' ? 2048 : 6500}
                placeholder={
                  name === 'interests'
                    ? 'Photography, books, walking…'
                    : name === 'socialLink'
                      ? 'https://example.com…'
                      : 'What should we call you?'
                }
              />
            )}
            <FieldError id={`${prefix}-${name}-error`} errors={[form.formState.errors[name]]} />
          </Field>
        );
      })}
      {error && <ErrorNotice message={error} />}
      <div className="form-actions">
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => {
            if (!dirty || window.confirm('Discard your unsaved changes?')) onCancel();
          }}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={pending || !!fileError}>
          {pending ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
