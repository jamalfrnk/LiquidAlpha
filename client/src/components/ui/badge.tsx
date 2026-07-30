import { type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', {
  variants: {
    variant: {
      neutral: 'bg-bg-floating text-ink-secondary border border-border',
      long: 'bg-long-muted text-long',
      short: 'bg-short-muted text-short',
      paper: 'bg-gold-500/15 text-gold-400 border border-gold-500/30',
      brand: 'bg-brand-500/15 text-brand-300 border border-brand-500/30',
    },
  },
  defaultVariants: { variant: 'neutral' },
});

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
