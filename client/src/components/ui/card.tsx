import { type HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

/** Base surface layer -- for the elevated/floating layers, add shadow-elevated / shadow-floating at the call site. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-xl border border-border-subtle bg-bg-elevated shadow-elevated', className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center justify-between gap-4 px-5 pt-5', className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('font-display text-lg font-medium tracking-tight text-ink-primary', className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 pb-5 pt-4', className)} {...props} />;
}
