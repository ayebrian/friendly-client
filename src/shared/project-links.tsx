import { ArrowUpRight } from 'lucide-react';
import { Button } from './ui/button';

const projects = [
  { label: 'Client repository', href: 'https://github.com/ayebrian/friendly-client' },
  { label: 'Friendly on GitHub', href: 'https://github.com/friendly-social' },
];

export function ProjectLinks() {
  return (
    <div className="project-links">
      {projects.map(({ label, href }) => (
        <Button
          key={href}
          asChild
          variant="link"
          className="h-auto min-h-11 max-w-full px-0 text-left text-sm whitespace-normal text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          <a href={href} target="_blank" rel="noopener noreferrer">
            {label} <ArrowUpRight aria-hidden="true" />
          </a>
        </Button>
      ))}
    </div>
  );
}
