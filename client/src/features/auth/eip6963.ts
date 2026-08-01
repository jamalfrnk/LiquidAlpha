import { useEffect, useState } from 'react';

/**
 * EIP-6963 (Multi Injected Provider Discovery) + the minimal EIP-1193
 * surface this app actually calls. Replaces the previous single
 * `window.ethereum` assumption, which is ambiguous the moment more than
 * one extension is installed (last injector typically wins, silently).
 */

export interface EIP6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

export interface EIP1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on(event: string, listener: (...args: unknown[]) => void): void;
  removeListener(event: string, listener: (...args: unknown[]) => void): void;
}

export interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo;
  provider: EIP1193Provider;
}

interface EIP6963AnnounceProviderEvent extends Event {
  detail: EIP6963ProviderDetail;
}

/**
 * Known `rdns` values -> a stable display label, so the selector reads
 * "MetaMask" / "Rabby" / "Phantom" rather than whatever free-text `name`
 * string each wallet chooses to announce (most match already, but rdns is
 * the part of the spec meant to be a stable identifier, not `name`).
 */
const KNOWN_WALLET_LABELS: Record<string, string> = {
  'io.metamask': 'MetaMask',
  'io.rabby': 'Rabby',
  'app.phantom': 'Phantom',
};

export function walletLabel(info: EIP6963ProviderInfo): string {
  return KNOWN_WALLET_LABELS[info.rdns] ?? info.name;
}

/**
 * Discovers every EIP-6963-announcing provider currently installed.
 * Providers can announce at any point after page load (including in
 * response to our own request event below), so this keeps listening for
 * the component's lifetime rather than reading a one-time snapshot.
 */
export function useEip6963Providers(): EIP6963ProviderDetail[] {
  const [providers, setProviders] = useState<Map<string, EIP6963ProviderDetail>>(new Map());

  useEffect(() => {
    function onAnnounce(event: Event) {
      const { detail } = event as EIP6963AnnounceProviderEvent;
      setProviders((prev) => {
        if (prev.has(detail.info.uuid)) return prev;
        const next = new Map(prev);
        next.set(detail.info.uuid, detail);
        return next;
      });
    }

    window.addEventListener('eip6963:announceProvider', onAnnounce);
    // Ask every already-loaded wallet extension to (re-)announce itself --
    // covers the case where our listener attached after a wallet's own
    // announcement already fired once at page load.
    window.dispatchEvent(new Event('eip6963:requestProvider'));

    return () => window.removeEventListener('eip6963:announceProvider', onAnnounce);
  }, []);

  return Array.from(providers.values()).sort((a, b) => walletLabel(a.info).localeCompare(walletLabel(b.info)));
}

/**
 * Phantom always injects `window.phantom.solana` when installed, even in
 * an EVM-only dApp -- but only announces an EIP-6963 EVM provider when its
 * "Ethereum & other" account setting is actually enabled. Used to show a
 * specific, actionable message (mission-specified copy) instead of Phantom
 * just silently never appearing in the list with no explanation.
 */
export function isPhantomInstalledWithoutEvmProvider(eip6963Providers: EIP6963ProviderDetail[]): boolean {
  const hasPhantomSolana = typeof window !== 'undefined' && Boolean((window as WindowWithPhantom).phantom?.solana);
  const hasPhantomEvm = eip6963Providers.some((p) => p.info.rdns === 'app.phantom');
  return hasPhantomSolana && !hasPhantomEvm;
}

/** Phantom's legacy (non-EIP-6963) Solana injection -- present whenever Phantom is installed, EVM support or not. */
interface WindowWithPhantom extends Window {
  phantom?: { solana?: unknown };
}
