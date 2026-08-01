import { Wifi, WifiOff } from 'lucide-react';
import type { ConnectionStatus as Status } from './useMarketDataSocket';

/**
 * Icon + text, never color alone -- a colorblind user or anyone on a
 * grayscale/high-contrast override still needs to be able to tell "live"
 * from "reconnecting" from the label text, not just a dot's hue.
 */
export function ConnectionStatus({ status }: { status: Status }) {
  const connected = status === 'connected';
  return (
    <div className="flex items-center gap-1.5 text-xs" role="status" aria-live="polite">
      {connected ? (
        <Wifi className="h-3.5 w-3.5 text-long" aria-hidden />
      ) : (
        <WifiOff className="h-3.5 w-3.5 text-gold-400" aria-hidden />
      )}
      <span className={connected ? 'text-ink-muted' : 'font-medium text-gold-400'}>
        {connected ? 'Live' : 'Reconnecting…'}
      </span>
    </div>
  );
}
