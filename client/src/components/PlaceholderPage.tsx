import { type LucideIcon } from 'lucide-react';
import { Card, CardContent } from './ui/card';

/**
 * Used for nav sections whose backend exists but whose screen hasn't been
 * built yet -- an honest "not built yet" state, not a silently broken or
 * fabricated one. Per the audit's own guidance: never show an empty or
 * fake view as if it were the real thing.
 */
export function PlaceholderPage({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="max-w-md text-center">
        <CardContent className="flex flex-col items-center gap-4 pt-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-500/15">
            <Icon className="h-6 w-6 text-brand-300" aria-hidden />
          </div>
          <h2 className="font-display text-xl font-medium tracking-tight text-ink-primary">{title}</h2>
          <p className="text-sm leading-relaxed text-ink-secondary">{description}</p>
        </CardContent>
      </Card>
    </div>
  );
}
