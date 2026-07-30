import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '../../lib/utils';

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn('inline-flex gap-1 rounded-lg border border-border-subtle bg-bg-elevated p-1', className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'rounded-md px-3.5 py-1.5 text-sm font-medium text-ink-secondary transition-colors duration-150 ' +
          'hover:text-ink-primary data-[state=active]:bg-brand-500/15 data-[state=active]:text-brand-200 ' +
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400',
        className,
      )}
      {...props}
    />
  );
}

export const TabsContent = TabsPrimitive.Content;
