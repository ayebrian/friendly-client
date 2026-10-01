import type { ComponentProps } from 'react';
import { Input } from './ui/input';
import { cn } from './lib/utils';

type Props = Omit<ComponentProps<typeof Input>, 'value' | 'onChange' | 'maxLength'> & {
  value: string;
  onChange: (digits: string) => void;
};

/** Normalize the full native paste before limiting digits; keep form values unformatted. */
export function EmailCodeInput({ value, onChange, className, ...props }: Props) {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  return (
    <Input
      {...props}
      inputMode="numeric"
      autoComplete="one-time-code"
      placeholder="0000-0000"
      className={cn('tracking-widest tabular-nums', className)}
      value={digits.length > 4 ? `${digits.slice(0, 4)}-${digits.slice(4)}` : digits}
      onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 8))}
    />
  );
}
