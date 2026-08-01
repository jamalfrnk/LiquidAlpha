import { walletLabel, type EIP6963ProviderDetail } from './eip6963';
import { Button } from '../../components/ui/button';

/**
 * Lists every EVM provider EIP-6963 discovery actually found -- never a
 * hardcoded "MetaMask/Rabby/Phantom" list, so an unrecognized-but-compliant
 * wallet still shows up (as its own announced name) rather than being
 * silently unsupported.
 */
export function WalletList({
  providers,
  onSelect,
  disabled,
}: {
  providers: EIP6963ProviderDetail[];
  onSelect: (provider: EIP6963ProviderDetail) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      {providers.map((detail) => (
        <Button
          key={detail.info.uuid}
          variant="secondary"
          className="w-full justify-start gap-3"
          onClick={() => onSelect(detail)}
          disabled={disabled}
        >
          {detail.info.icon && <img src={detail.info.icon} alt="" aria-hidden className="h-5 w-5 rounded-sm" />}
          {walletLabel(detail.info)}
        </Button>
      ))}
    </div>
  );
}
