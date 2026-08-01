import { useAuth } from '../features/auth/AuthProvider';
import { isPhantomInstalledWithoutEvmProvider } from '../features/auth/eip6963';
import { WalletList } from '../features/auth/WalletList';
import { Badge } from '../components/ui/badge';

export function ConnectScreen() {
  const { login, isConnecting, connectError, accountChangedNotice, dismissAccountChangedNotice, eip6963Providers } =
    useAuth();

  const phantomNeedsEvmEnabled = isPhantomInstalledWithoutEvmProvider(eip6963Providers);

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
          leaves your wallet or reaches this server. This signs you in to an educational paper-trading platform; it
          never approves a transaction.
        </p>

        <div className="mt-6">
          <Badge variant="paper">Paper Trading environment</Badge>
        </div>

        {accountChangedNotice && (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-gold-500/30 bg-gold-500/10 p-3 text-sm text-gold-400"
          >
            {accountChangedNotice}{' '}
            <button type="button" className="underline" onClick={dismissAccountChangedNotice}>
              Dismiss
            </button>
          </p>
        )}

        <div className="mt-6">
          {eip6963Providers.length > 0 ? (
            <WalletList providers={eip6963Providers} onSelect={(p) => void login(p)} disabled={isConnecting} />
          ) : (
            <p role="alert" className="text-sm text-short">
              No compatible EVM wallet was found. Install MetaMask, Rabby, Phantom, or another EIP-1193 wallet.
            </p>
          )}
        </div>

        {phantomNeedsEvmEnabled && (
          <p className="mt-3 text-xs leading-relaxed text-gold-400">
            Phantom was detected, but its EVM provider is unavailable. Enable an Ethereum-compatible account in Phantom
            or choose another EVM wallet.
          </p>
        )}

        {isConnecting && (
          <p className="mt-3 text-sm text-ink-secondary" role="status" aria-live="polite">
            Connecting…
          </p>
        )}

        {connectError && (
          <p role="alert" className="mt-4 text-sm text-short">
            {connectError}
          </p>
        )}

        <p className="mt-6 text-xs leading-relaxed text-ink-muted">
          EVM wallets only (MetaMask, Rabby, Phantom's EVM account, or another EIP-6963-compliant extension).
        </p>
      </div>
    </div>
  );
}
