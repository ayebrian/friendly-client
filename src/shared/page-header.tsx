import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { Button } from './ui/button';

export function PageHeader({
  children,
  backTo,
  backLabel = 'Back',
}: {
  children: ReactNode;
  backTo?: string;
  backLabel?: string;
}) {
  return (
    <header className="page-heading">
      {backTo && (
        <Button asChild variant="ghost" size="icon">
          <Link to={backTo} aria-label={backLabel}>
            <ArrowLeft />
          </Link>
        </Button>
      )}
      <div className="page-heading-content">{children}</div>
    </header>
  );
}
