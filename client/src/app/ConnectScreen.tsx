import { useAuth } from '../features/auth/AuthProvider';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';

export function ConnectScreen() {
  const { login, isConnecting, connectError } = useAuth();

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg-base px-6">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(60rem 40rem at 15% -10%, rgba(108,76,224,0.16), transparent), ' +
            'radial-gradient(50rem 35rem at 90% 10%, rgba(245,166,35,0.10), transparent)',
        }}
      />

      <div className="relative z-10 w-full max-w-md animate-slide-up rounded-2xl border border-border-subtle bg-bg-elevated p-8 shadow-floating">
        <div className="mb-8 flex items-center gap-2">
          <span className="font-display text-2xl font-semibold tracking-tight text-ink-primary">Liquid</span>
          <span className="font-display text-2xl font-semibold tracking-tight text-gold-400">Alpha</span>
        </div>

        <h1 className="font-display text-2xl font-medium tracking-tight text-ink-primary">Sign in with your wallet</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
          No password, no email. Your wallet signs a one-time message to prove ownership -- your private key never
          leaves your wallet or reaches this server.
        </p>

        <div className="mt-6">
          <Badge variant="paper">Paper Trading environment</Badge>
        </div>

        <Button className="mt-6 w-full" size="lg" onClick={() => void login()} disabled={isConnecting}>
          {isConnecting ? 'Connecting…' : 'Connect Wallet'}
        </Button>

        {connectError && (
          <p role="alert" className="mt-4 text-sm text-short">
            {connectError}
          </p>
        )}

        <p className="mt-6 text-xs leading-relaxed text-ink-muted">
          EVM wallets (MetaMask and compatible extensions) only, for now. Requires a browser wallet extension to be
          installed.
        </p>
      </div>
    </div>
  );
}
