import { type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { LogOut } from 'lucide-react';
import { cn } from '../lib/utils';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { useAuth } from '../features/auth/AuthProvider';
import { useMarketDataSocket } from '../features/realtime/useMarketDataSocket';
import { ConnectionStatus } from '../features/realtime/ConnectionStatus';
import { ErrorBoundary } from './ErrorBoundary';
import { NAV_ITEMS } from '../routes/nav';

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function AppShell({ children }: { children: ReactNode }) {
  // Mounted once here, not per-page -- every screen reads the same
  // WS-updated query cache instead of each opening its own socket.
  const wsStatus = useMarketDataSocket();

  const [location] = useLocation();
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen bg-bg-base">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border-subtle bg-bg-elevated">
        <div className="flex items-center gap-2 px-5 py-6">
          <span className="font-display text-xl font-semibold tracking-tight text-ink-primary">Liquid</span>
          <span className="font-display text-xl font-semibold tracking-tight text-gold-400">Alpha</span>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = location === href;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150',
                  active
                    ? 'bg-brand-500/15 text-brand-200'
                    : 'text-ink-secondary hover:bg-bg-floating hover:text-ink-primary',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border-subtle p-4">
          <Badge variant="paper" className="w-full justify-center">
            Paper Trading
          </Badge>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-border-subtle bg-bg-elevated/60 px-6 backdrop-blur">
          <ConnectionStatus status={wsStatus} />
          <div className="flex items-center gap-3">
            {user && (
              <Badge variant="brand" className="tabular-nums">
                {truncateAddress(user.address)}
              </Badge>
            )}
            <Button variant="ghost" size="sm" onClick={() => void logout()}>
              <LogOut className="h-4 w-4" aria-hidden />
              Log out
            </Button>
          </div>
        </header>

        <main className="flex-1 animate-fade-in px-8 py-8">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
