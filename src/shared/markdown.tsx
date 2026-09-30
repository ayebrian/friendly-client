import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import remarkGemoji from 'remark-gemoji';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';

const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'audio'],
  attributes: { ...defaultSchema.attributes, audio: ['src', 'controls'] },
};

export function Markdown({ text, compact = false }: { text: string; compact?: boolean }) {
  return (
    <div className={`markdown${compact ? ' markdown-compact' : ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks, remarkGemoji]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
        components={{
          h1: 'h2',
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          img: ({ src, alt }) =>
            src ? (
              <Dialog>
                <DialogTrigger asChild>
                  <Button
                    variant="ghost"
                    className="image-trigger"
                    aria-label={`Open image: ${alt || 'photo'}`}
                  >
                    <img src={src} alt={alt ?? ''} loading="lazy" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="image-dialog">
                  <DialogTitle>{alt || 'Image'}</DialogTitle>
                  <DialogDescription className="sr-only">
                    View the image at full size
                  </DialogDescription>
                  <img src={src} alt={alt ?? ''} />
                </DialogContent>
              </Dialog>
            ) : null,
          audio: ({ src }) => <audio src={src} controls preload="none" />,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
