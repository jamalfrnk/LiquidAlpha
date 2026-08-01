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
import { MobileNavDrawer } from './MobileNavDrawer';
import { NAV_ITEMS } from '../routes/nav';

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * Nav content shared between the always-visible desktop sidebar and the
 * <lg off-canvas drawer, so the two never drift out of sync with each
 * other. `onNavigate` closes the drawer on link click -- irrelevant (and
 * omitted) when rendered inline in the desktop sidebar.
 */
function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const [location] = useLocation();
  return (
    <>
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
              onClick={onNavigate}
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
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  // Mounted once here, not per-page -- every screen reads the same
  // WS-updated query cache instead of each opening its own socket.
  const wsStatus = useMarketDataSocket();
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen bg-bg-base">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border-subtle bg-bg-elevated lg:flex">
        <SidebarContent />
      </aside>

      {/* min-w-0 overrides the flex-item default of min-width:auto --
          without it, a wide child (a table on Positions/Analytics) forces
          this column past the viewport instead of scrolling internally. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between gap-2 border-b border-border-subtle bg-bg-elevated/60 px-4 backdrop-blur sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {/* Trigger renders in place; its drawer content teleports via
                a Radix Portal, so this is the only spot it needs to live. */}
            <MobileNavDrawer>{(close) => <SidebarContent onNavigate={close} />}</MobileNavDrawer>
            <ConnectionStatus status={wsStatus} />
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {user && (
              <Badge variant={user.kind === 'guest' ? 'neutral' : 'brand'} className="tabular-nums">
                {user.kind === 'guest' ? 'Guest' : truncateAddress(user.address)}
              </Badge>
            )}
            <Button variant="ghost" size="sm" onClick={() => void logout()} aria-label="Log out">
              <LogOut className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Log out</span>
            </Button>
          </div>
        </header>

        <main className="min-w-0 flex-1 animate-fade-in px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
