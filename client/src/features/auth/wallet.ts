import { BrowserProvider } from 'ethers';
import type { EIP1193Provider } from './eip6963';

/**
 * Operates against a caller-supplied EIP-1193 provider instance (from
 * EIP-6963 discovery) rather than the global `window.ethereum` -- with
 * more than one extension installed, `window.ethereum` is ambiguous about
 * which wallet actually handles the request.
 */

/** EIP-1193's standard "user rejected the request" error code. */
const USER_REJECTED_CODE = 4001;

function isUserRejection(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === USER_REJECTED_CODE
  );
}

/**
 * `new Error(msg, { cause })` needs an ES2022 lib target this package's
 * tsconfig doesn't set (ES2020) -- assigning `.cause` directly after
 * construction gets the same debugging value (the original wallet error is
 * still attached, not discarded) without bumping the compiler target for
 * the whole package just for this.
 */
function errorWithCause(message: string, cause: unknown): Error {
  const error = new Error(message);
  (error as Error & { cause?: unknown }).cause = cause;
  return error;
}

export async function connectEvmWallet(provider: EIP1193Provider, walletName: string): Promise<string> {
  let accounts: string[];
  try {
    accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
  } catch (err) {
    if (isUserRejection(err)) {
      throw errorWithCause('Connection request cancelled. Liquid Alpha did not receive access to your wallet.', err);
    }
    throw err;
  }

  const address = accounts[0];
  if (!address) {
    throw new Error(`${walletName} was detected, but no EVM account was returned.`);
  }
  return address;
}

/** Signs `message` verbatim -- the client never reconstructs or alters the message the server issued. */
export async function signMessage(provider: EIP1193Provider, address: string, message: string): Promise<string> {
  const browserProvider = new BrowserProvider(provider);
  try {
    const signer = await browserProvider.getSigner(address);
    return await signer.signMessage(message);
  } catch (err) {
    if (isUserRejection(err)) {
      throw errorWithCause(
        'Signature request cancelled. Liquid Alpha did not receive a signed message from your wallet.',
        err,
      );
    }
    throw err;
  }
}

export async function getCurrentAccounts(provider: EIP1193Provider): Promise<string[]> {
  return (await provider.request({ method: 'eth_accounts' })) as string[];
}
