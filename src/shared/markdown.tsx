import ReactMarkdown, { defaultUrlTransform, type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import remarkGemoji from 'remark-gemoji';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { MediaContent } from './media-content';

const sanitizeSchema = {
  ...defaultSchema,
  // source/srcset must not bypass the consent gate on img/video/audio.
  tagNames: [
    ...(defaultSchema.tagNames ?? []).filter((tag) => !['picture', 'source'].includes(tag)),
    'audio',
    'video',
  ],
  attributes: {
    ...defaultSchema.attributes,
    audio: ['src', 'controls'],
    video: ['src', 'controls', 'playsInline'],
  },
  protocols: { ...defaultSchema.protocols, src: [...(defaultSchema.protocols?.src ?? []), 'blob'] },
};

// Quotes remain text: no nested links, image dialogs or media downloads.
export function MarkdownExcerpt({ text }: { text: string }) {
  return (
    <div className="reply-excerpt">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks, remarkGemoji]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
        components={{
          a: ({ children }) => <span>{children}</span>,
          img: ({ alt }) => <span>[Image{alt ? `: ${alt}` : ''}]</span>,
          audio: () => <span>[Audio]</span>,
          video: () => <span>[Video]</span>,
          input: () => null,
          details: ({ children }) => <div>{children}</div>,
          summary: ({ children }) => <span>{children}</span>,
          hr: () => <span> · </span>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

// Stable renderer identities preserve a media approval across ordinary query refreshes.
const markdownComponents: Components = {
  h1: 'h2',
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  img: ({ src, alt }) => <MediaContent key={src} src={src} alt={alt} kind="image" />,
  audio: ({ src }) => <MediaContent key={src} src={src} kind="audio" />,
  video: ({ src }) => <MediaContent key={src} src={src} kind="video" />,
};

export function Markdown({ text, compact = false }: { text: string; compact?: boolean }) {
  return (
    <div className={`markdown${compact ? ' markdown-compact' : ''}`}>
      <ReactMarkdown
        urlTransform={(url) => {
          if (url.startsWith('blob:')) {
            try {
              return new URL(url).origin === window.location.origin ? url : '';
            } catch {
              return '';
            }
          }
          return defaultUrlTransform(url);
        }}
        remarkPlugins={[remarkGfm, remarkBreaks, remarkGemoji]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
        components={markdownComponents}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
