import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '../../lib/utils';

export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'relative h-6 w-11 shrink-0 rounded-full border border-border-subtle bg-bg-elevated transition-colors duration-150 ' +
          'data-[state=checked]:border-brand-500 data-[state=checked]:bg-brand-500 ' +
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base ' +
          'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'block h-4 w-4 translate-x-1 rounded-full bg-ink-primary shadow-elevated transition-transform duration-150 ' +
            'data-[state=checked]:translate-x-[22px] data-[state=checked]:bg-white',
        )}
      />
    </SwitchPrimitive.Root>
  );
}
