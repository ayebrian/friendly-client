import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useEffect, useId, useRef, useState } from 'react';
import { ClipboardPaste, Paperclip, X } from 'lucide-react';
import { toast } from 'sonner';
import type { FileDescriptor } from '../../domain/models';
import { Button } from '../../shared/ui/button';
import { Input } from '../../shared/ui/input';
import { Field, FieldLabel, FieldError } from '../../shared/ui/field';
import { Markdown } from '../../shared/markdown';
import { ErrorNotice } from '../../shared/feedback';
import { errorMessage } from '../../shared/errors';
import { useUnsavedChanges } from '../../shared/use-unsaved';
import { useRuntime } from '../../shared/runtime';
import { useOperation } from '../../shared/use-operation';
import { MediaTextEditor } from '../../shared/media-text-editor';
import { readClipboardMedia } from '../../shared/media-transfer';
import { maxAttachments, mediaAccept, mediaFile, mediaMarkup } from './media';

type Attachment = { id: number; file: File; preview: string; uploaded?: FileDescriptor };

export function PostComposer({
  initial = '',
  label = 'New post',
  submitLabel = 'Post',
  onSubmit,
  onCancel,
  onDirtyChange,
  onBusyChange,
  compact = false,
}: {
  initial?: string;
  label?: string;
  submitLabel?: string;
  onSubmit: (text: string) => Promise<unknown>;
  onCancel?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
  compact?: boolean;
}) {
  const { gateway } = useRuntime();
  const prefix = useId();
  const mediaErrorToast = `media-error-${prefix}`;
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState('');
  const [mediaError, setMediaError] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const currentAttachments = useRef<Attachment[]>([]);
  const nextId = useRef(0);
  const previewUrls = useRef(new Set<string>());
  const picker = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<number | null>(null);
  const [readingClipboard, setReadingClipboard] = useState(false);
  const [lifetime] = useState(() => ({ current: new AbortController() }));
  useEffect(() => {
    lifetime.current = new AbortController();
    const urls = previewUrls.current;
    return () => {
      lifetime.current.abort();
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
      toast.dismiss(mediaErrorToast);
    };
  }, [lifetime, mediaErrorToast]);

  const schema = z.object({
    text: z
      .string()
      .trim()
      .refine(
        (text) => !!text || !!currentAttachments.current.length,
        'Write a few words or add media first.',
      ),
  });
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { text: initial } });
  const send = useOperation(async (input: { text: string; files: Attachment[] }, signal) => {
    const snippets: string[] = [];
    for (const attachment of input.files) {
      let descriptor = attachment.uploaded;
      if (!descriptor) {
        setUploading(attachment.id);
        descriptor = await gateway.uploadMedia(attachment.file, signal);
        signal.throwIfAborted();
        const next = currentAttachments.current.map((item) =>
          item.id === attachment.id ? { ...item, uploaded: descriptor } : item,
        );
        currentAttachments.current = next;
        setAttachments(next);
      }
      snippets.push(mediaMarkup(attachment.file, gateway.fileUrl(descriptor)));
    }
    signal.throwIfAborted();
    setUploading(null);
    await onSubmit([input.text, ...snippets].filter(Boolean).join('\n\n'));
  });
  const pending = form.formState.isSubmitting || send.isPending || readingClipboard;
  useEffect(() => {
    onBusyChange?.(pending);
    return () => onBusyChange?.(false);
  }, [pending, onBusyChange]);
  const dirty = form.formState.isDirty || !!attachments.length;
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);
  const guard = useUnsavedChanges(dirty && !pending);

  function addFiles(files: File[]) {
    if (pending || lifetime.current.signal.aborted) return;
    const next = [...currentAttachments.current];
    const errors: string[] = [];
    for (const file of files) {
      try {
        const media = mediaFile(file);
        if (next.length >= maxAttachments)
          throw new Error(`Add up to ${maxAttachments} files per post.`);
        const url = URL.createObjectURL(media);
        previewUrls.current.add(url);
        next.push({ id: ++nextId.current, file: media, preview: url });
      } catch (error) {
        errors.push(errorMessage(error));
      }
    }
    currentAttachments.current = next;
    setAttachments(next);
    const message = [...new Set(errors)].join(' ');
    setMediaError(message);
    if (message) toast.error(message, { id: mediaErrorToast });
    else toast.dismiss(mediaErrorToast);
    if (next.length) form.clearErrors('text');
  }

  function removeAttachment(attachment: Attachment) {
    URL.revokeObjectURL(attachment.preview);
    previewUrls.current.delete(attachment.preview);
    const next = currentAttachments.current.filter((item) => item.id !== attachment.id);
    currentAttachments.current = next;
    setAttachments(next);
  }

  return (
    <>
      <form
        className={`composer${compact ? ' composer-compact' : ''}`}
        noValidate
        onSubmit={form.handleSubmit(async ({ text }) => {
          if (pending) return;
          setError('');
          try {
            await send.mutateAsync({ text, files: currentAttachments.current });
            if (lifetime.current.signal.aborted) return;
            form.reset({ text: '' });
            previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
            previewUrls.current.clear();
            currentAttachments.current = [];
            setAttachments([]);
            setMediaError('');
          } catch (err) {
            if (!lifetime.current.signal.aborted) setError(errorMessage(err));
          } finally {
            if (!lifetime.current.signal.aborted) setUploading(null);
          }
        })}
      >
        <Field data-invalid={!!form.formState.errors.text}>
          <FieldLabel
            id={`${prefix}-label`}
            htmlFor={`${prefix}-text`}
            className={compact ? 'sr-only' : undefined}
          >
            {label}
          </FieldLabel>
          {preview ? (
            <div className="composer-preview">
              <Markdown text={form.getValues('text') || 'Your preview will appear here.'} />
            </div>
          ) : (
            <Controller
              control={form.control}
              name="text"
              render={({ field, fieldState }) => (
                <MediaTextEditor
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  ref={field.ref}
                  onFiles={addFiles}
                  disabled={pending}
                  id={`${prefix}-text`}
                  labelledBy={`${prefix}-label`}
                  describedBy={`${prefix}-error ${prefix}-media-help`}
                  invalid={fieldState.invalid}
                  compact={compact}
                />
              )}
            />
          )}
          <FieldError id={`${prefix}-error`} errors={[form.formState.errors.text]} />
        </Field>
        <p className="field-hint" id={`${prefix}-media-help`}>
          Photos, GIFs, video and audio · up to 5 MB each. Choose files or paste into the editor.
        </p>
        <Input
          ref={picker}
          type="file"
          hidden
          aria-label="Choose media files"
          accept={mediaAccept}
          multiple
          disabled={pending}
          tabIndex={-1}
          onChange={(event) => {
            addFiles(Array.from(event.currentTarget.files ?? []));
            event.currentTarget.value = '';
          }}
        />
        {!!attachments.length && (
          <ul className="composer-attachments" aria-label="Attached media">
            {attachments.map((attachment) => (
              <li key={attachment.id} className="composer-attachment">
                {attachment.file.type.startsWith('image/') ? (
                  <img src={attachment.preview} alt={attachment.file.name} />
                ) : attachment.file.type.startsWith('video/') ? (
                  <video src={attachment.preview} controls playsInline preload="metadata" />
                ) : (
                  <audio src={attachment.preview} controls preload="metadata" />
                )}
                <div className="attachment-caption">
                  <div>
                    <span>{attachment.file.name}</span>
                    <span className="muted">
                      {(attachment.file.size / 1_000_000).toFixed(2)} MB ·{' '}
                      {uploading === attachment.id
                        ? 'Uploading…'
                        : attachment.uploaded
                          ? 'Uploaded'
                          : 'Ready'}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${attachment.file.name}`}
                    disabled={pending}
                    onClick={() => removeAttachment(attachment)}
                  >
                    <X />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {mediaError && (
          <div>
            <ErrorNotice message={mediaError} />
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setMediaError('');
                toast.dismiss(mediaErrorToast);
              }}
            >
              Dismiss media error
            </Button>
          </div>
        )}
        {error && <ErrorNotice message={error} />}
        <span className="sr-only" role="status">
          {uploading !== null
            ? 'Uploading media…'
            : pending
              ? 'Please wait…'
              : attachments.length
                ? `${attachments.length} files attached`
                : ''}
        </span>
        <div className="composer-toolbar">
          <div className="composer-media-actions">
            <Button
              type="button"
              variant="ghost"
              aria-label="Add media"
              disabled={pending}
              onClick={() => picker.current?.click()}
            >
              <Paperclip />
              Media
            </Button>
            {typeof navigator.clipboard?.read === 'function' && (
              <Button
                type="button"
                variant="ghost"
                aria-label="Paste media"
                disabled={pending}
                onClick={async () => {
                  const signal = lifetime.current.signal;
                  setReadingClipboard(true);
                  setMediaError('');
                  toast.dismiss(mediaErrorToast);
                  try {
                    const files = await readClipboardMedia();
                    signal.throwIfAborted();
                    addFiles(files);
                  } catch {
                    if (!signal.aborted) {
                      const message =
                        'Could not read media from the clipboard. Paste into the editor or choose a file.';
                      setMediaError(message);
                      toast.error(message, { id: mediaErrorToast });
                    }
                  } finally {
                    if (!signal.aborted) setReadingClipboard(false);
                  }
                }}
              >
                <ClipboardPaste />
                Paste
              </Button>
            )}
          </div>
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
              {uploading !== null ? 'Uploading…' : pending ? 'Sending…' : submitLabel}
            </Button>
          </div>
        </div>
      </form>
      {guard.confirmation}
    </>
  );
}
