import { BrowserProvider } from 'ethers';

/**
 * EVM-only for this first pass (window.ethereum via MetaMask or an
 * equivalent injected provider). Solana wallet connect (Phantom) is a
 * deliberately separate follow-up -- building both wallet ecosystems'
 * connect flows in the same change was more than this app shell needed to
 * prove the auth wiring end to end.
 */

function getInjectedProvider(): BrowserProvider {
  if (!window.ethereum) {
    throw new Error('No EVM wallet found. Install MetaMask or another browser wallet extension.');
  }
  return new BrowserProvider(window.ethereum);
}

export async function connectEvmWallet(): Promise<string> {
  const provider = getInjectedProvider();
  const accounts = (await provider.send('eth_requestAccounts', [])) as string[];
  const address = accounts[0];
  if (!address) throw new Error('No account was returned by the wallet.');
  return address;
}

/** Signs `message` verbatim -- the client never reconstructs or alters the message the server issued. */
export async function signMessage(address: string, message: string): Promise<string> {
  const provider = getInjectedProvider();
  const signer = await provider.getSigner(address);
  return signer.signMessage(message);
}
