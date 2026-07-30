/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_WS_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Injected by browser wallet extensions (MetaMask, etc.) -- shape beyond `request`/`send` is provider-specific. */
interface Window {
  ethereum?: import('ethers').Eip1193Provider;
}
