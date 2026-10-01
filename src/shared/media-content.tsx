import { useContext, useState } from 'react';
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { RuntimeContext } from './runtime';

/** Only our origin, local previews and gateway downloads load without consent. */
function mediaSource(source: string, baseUrl?: string) {
  try {
    const url = new URL(source, window.location.href);
    if (url.username || url.password) return null;
    if (url.protocol === 'blob:')
      return url.origin === window.location.origin ? { url, trusted: true } : null;
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    let trusted = url.origin === window.location.origin;
    if (baseUrl) {
      const base = new URL(baseUrl);
      trusted ||=
        url.origin === base.origin &&
        url.pathname.startsWith(`${base.pathname.replace(/\/$/, '')}/files/download/`);
    }
    return { url, trusted };
  } catch {
    return null;
  }
}

export function MediaContent({
  src,
  alt,
  kind,
}: {
  src?: string;
  alt?: string;
  kind: 'image' | 'audio' | 'video';
}) {
  const runtime = useContext(RuntimeContext);
  const [approved, setApproved] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const source = src && mediaSource(src, runtime?.mediaBaseUrl);
  if (!source) return null;
  if (failed || (!source.trusted && !approved))
    return (
      <span className="external-media">
        <span className="external-media-description">
          <strong>{failed ? `Could not load ${kind}` : `External ${kind}`}</strong>
          <span>{source.url.hostname}</span>
          {!source.trusted && <span>Loading this media connects to that site.</span>}
        </span>
        <Button
          variant="outline"
          onClick={() => {
            setApproved(true);
            setFailed(false);
            setAttempt((value) => value + 1);
          }}
        >
          {failed ? `Retry ${kind}` : `Load ${kind}`}
        </Button>
      </span>
    );
  const url = source.url.href;
  const onError = () => setFailed(true);
  if (kind === 'audio')
    return <audio key={attempt} src={url} controls preload="none" onError={onError} />;
  if (kind === 'video')
    return (
      <video key={attempt} src={url} controls playsInline preload="metadata" onError={onError} />
    );
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          className="image-trigger"
          aria-label={`Open image: ${alt || 'photo'}`}
        >
          <img
            key={attempt}
            src={url}
            alt={alt ?? ''}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={onError}
          />
        </Button>
      </DialogTrigger>
      <DialogContent className="image-dialog">
        <DialogTitle>{alt || 'Image'}</DialogTitle>
        <DialogDescription className="sr-only">View the image at full size</DialogDescription>
        <img src={url} alt={alt ?? ''} referrerPolicy="no-referrer" onError={onError} />
      </DialogContent>
    </Dialog>
  );
}
