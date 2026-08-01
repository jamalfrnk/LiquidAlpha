# Wallet and Identity (WALLET-001 issue #32, AUTH-GUEST-001 issue #33)

## Status: partially implemented

**Implemented:** EIP-6963 multi-wallet discovery, per-wallet disambiguation (no more
`window.ethereum` last-injector-wins ambiguity), account-change session invalidation,
wallet-initiated disconnect handling, no-stuck-connecting-state, duplicate-click
guarding, wallet-selection persistence across refresh, server-managed guest-practice
sessions (no wallet required), guest isolation, guest paper trading through the
existing risk-gated execution path unmodified.

**Deferred:** guest-to-wallet migration (preserving a guest's practice history when
they later connect a wallet) -- explicitly out of scope for this bounded issue per
the mission's own instruction to avoid an unsafe partial merge; tracked as a separate
follow-up. "Wallet disconnect returns to guest mode" is not implemented as an
automatic transition -- disconnecting a wallet returns to `ConnectScreen`, where
starting a guest session is one click away, rather than silently and implicitly
creating a new guest identity on disconnect.

## Guest sessions (AUTH-GUEST-001)

### Problem

Every screen required a connected wallet. No server-managed anonymous/guest session
type existed -- `server/src/auth/` implemented only wallet-signature sessions.

### Design

A guest is structurally just a `users` row with `kind: 'guest'` (new column, default
`'wallet'` for every existing/wallet row) and synthetic-but-unique `address`
(`guest:<uuid>`) / `chain` (`'guest'`) values -- **not** a parallel identity system.
This was a deliberate structural choice verified before writing any code: grepped
`execution/`, `risk/`, and `analytics/` for wallet-specific assumptions and found
none -- every consumer of identity in this codebase already keys off `users.id`
alone. That means a guest's paper trades flow through the *exact same* risk-gated
`paperEngine.ts` execution path a wallet user's do, with zero changes to execution,
risk, or analytics code.

- `POST /api/auth/guest` (new, rate-limited with the same `authLimiter` as
  nonce/verify): creates a fresh guest user + session, sets the identical httpOnly
  session cookie a wallet login would. No request body, no signature.
- Session restore, revocation, and the `requireAuth` middleware are completely
  unchanged -- they already only cared about `userId`, never about how that user
  authenticated.
- Client: `loginAsGuest()` on the auth context, a "Continue as Guest" button on
  `ConnectScreen` (now the primary/first action, wallet connect is secondary), and
  `AppShell` shows a neutral "Guest" badge instead of a truncated address when
  `user.kind === 'guest'`.

### Verified against the real stack, not just mocked

Ran a real local server against a real Postgres, migrated the schema, and exercised
the actual HTTP endpoints end to end:

1. `POST /api/auth/guest` → real session cookie issued.
2. `GET /api/auth/me` with that cookie → session correctly restored (same mechanism
   as a wallet session surviving a refresh).
3. `GET /api/risk/limits` → real default risk limits auto-created for the guest,
   identical to a wallet user's.
4. `POST /api/execution/orders` (a real market order) → **filled at a real
   Hyperliquid-sourced price** (DATA-HL-001's live ingestion, not a fabricated
   number) and a real position opened -- through the unmodified, already-risk-gated
   `paperEngine.ts`.
5. **Isolation**: created a second, independent guest session. Its
   `GET /api/execution/positions` returned empty (did not see the first guest's
   position). Attempting to close the first guest's position by ID from the second
   guest's session returned **403** -- the pre-existing ownership check in
   `paperEngine.ts` (already covered by `cancelOrder ownership`/`closePosition
   ownership` tests) rejects cross-user access identically regardless of whether
   either side is a guest or a wallet user, with no guest-specific logic needed.

### Non-goals / deferred

- **Guest-to-wallet migration.** Preserving a guest's paper-trading history when they
  connect a wallet requires transactional safety this bounded issue explicitly
  didn't attempt (avoiding duplicate orders, avoiding merging unrelated accounts) --
  per the mission's own instruction, deferred to a separate, dependency-aware issue
  rather than shipped as an unsafe partial merge. A guest's data is preserved
  (nothing deletes it), just not yet portable to a subsequently-connected wallet.
- **Guest data retention/TTL.** No automatic cleanup of abandoned guest rows exists
  yet -- every `POST /api/auth/guest` call creates a permanent row today. Worth a
  future look if guest-row volume becomes a real concern; not addressed here.
- **Automatic wallet-disconnect-to-guest transition.** Disconnecting a wallet doesn't
  auto-start a new guest session; it returns to `ConnectScreen`, matching how
  disconnect already worked before this issue.

## Problem

`client/src/features/auth/wallet.ts` read `window.ethereum` directly. With more than
one EVM extension installed, this is ambiguous (which extension "wins" the global is
implementation-defined per browser/extension load order) and Phantom's EVM provider
specifically was never distinguished from a Solana-only context.

## What changed

- `features/auth/eip6963.ts` (new): `useEip6963Providers()` hook listening for
  `eip6963:announceProvider` and dispatching `eip6963:requestProvider` on mount;
  `walletLabel()` maps known `rdns` values (`io.metamask`, `io.rabby`, `app.phantom`)
  to a stable display name, falling back to the wallet's own announced `name` for
  anything else -- so an unrecognized-but-EIP-6963-compliant wallet still works,
  never silently unsupported.
- `features/auth/wallet.ts` (rewritten): every function now takes an explicit
  `EIP1193Provider` instance instead of reading the global -- `connectEvmWallet`,
  `signMessage`, `getCurrentAccounts`. EIP-1193 error code `4001` (user rejected) is
  mapped to specific, recoverable copy; other errors propagate with their original
  `cause` attached (not swallowed).
- `features/auth/WalletList.tsx` (new): renders every detected provider by its
  announced icon + label; never a hardcoded three-wallet list.
- `features/auth/AuthProvider.tsx` (rewritten): `login()` now takes a specific
  `EIP6963ProviderDetail`. Attaches `accountsChanged`/`disconnect` listeners to the
  active provider once both it and an authenticated `user` are known; persists the
  selected wallet's `rdns` to `localStorage` so a refreshed page re-attaches
  listeners to the same wallet without requiring a new connection.
- `app/ConnectScreen.tsx` (rewritten): renders the wallet list when providers are
  detected, the mission's exact "No compatible EVM wallet was found..." copy when
  none are, and a Phantom-specific hint (`isPhantomInstalledWithoutEvmProvider`) when
  Phantom's Solana injection is present but its EVM provider never announced.

## Required lifecycle behavior -- verified, not just implemented

| Scenario | Behavior | How verified |
|---|---|---|
| Multiple wallets installed | Each listed distinctly by name/icon | CDP: injected fake MetaMask + Rabby providers, both rendered |
| Click routes to the *correct* wallet | Only the clicked wallet's provider receives `eth_requestAccounts` | CDP: clicking "Rabby" logged `[fake-Rabby] eth_requestAccounts` — the *other* fake (MetaMask) never received a call |
| Account changes while connected | Session cleared, mission's exact re-sign copy shown | `AuthProvider.test.tsx`: fires `accountsChanged` with a different address, asserts session clears + notice text matches exactly |
| Same account re-reported (case difference) | No-op -- no spurious session clear | `AuthProvider.test.tsx`: fires `accountsChanged` with same address, different case; asserts nothing changed |
| Wallet reports zero accounts / fires `disconnect` | Treated as logout | Code path shared with the explicit account-change-to-empty-array case in `AuthProvider.tsx` |
| Rejected connection request | Exact mission-specified copy | `wallet.test.ts`: mocked EIP-1193 code-4001 rejection |
| Approved but zero accounts returned | Wallet-specific "no EVM account was returned" copy | `wallet.test.ts` |
| Zero wallets installed | Exact mission-specified copy | CDP: no fake providers injected, screenshotted |
| No stuck "Connecting…" state | `isConnecting` always resolves via `finally` | Structural (not conditional) -- verified by reading the code path; also never observed stuck in any CDP run |
| Duplicate/concurrent connect clicks | Guarded (`if (isConnecting) return`) | Code review; not independently stress-tested under real race conditions in this pass |
| Browser refresh | Session restored via existing cookie-based `fetchMe` query, unchanged; listeners re-attached to the same wallet via persisted `rdns` if still installed | Code review (this path was already correct pre-WALLET-001 for the session itself; this issue only adds the listener re-attachment on top) |
| No `window.location.reload()` anywhere | Confirmed by inspection -- none introduced | `grep` across the touched files |

CDP screenshots (guest connect screen: two-wallet list, zero-wallet state, and the
post-click state showing a real server-rejected fake signature -- confirming the
full connect → nonce → sign → verify chain runs against the *real* backend, not a
mocked one) are not committed to the repo (ephemeral verification artifacts), but
the exact sequence is reproducible: inject an `eip6963:announceProvider`-dispatching
script via CDP's `Page.addScriptToEvaluateOnNewDocument` before navigation.

## Non-goals (unchanged from the mission)

- No Solana wallet connection flow.
- No hardware-wallet-specific handling beyond what EIP-1193 already provides.
- No chain-switch enforcement (chain changes are informational only, paper trading
  doesn't require a specific network).

## Known limitations

- **Guest mode doesn't exist yet.** "Disconnect returns to guest mode" currently
  means "disconnect returns to `ConnectScreen`" -- the correct behavior once
  `AUTH-GUEST-001` lands, not before.
- **Provider disappearance** (extension uninstalled mid-session) isn't proactively
  detected -- the next operation against a stale provider reference will simply
  fail with whatever error the browser/ethers surfaces, rather than a dedicated
  "your wallet disappeared" message. Not exercised in this pass.
- **Duplicate/concurrent connect-click guarding** is a simple boolean re-entrancy
  guard, not stress-tested against real overlapping-request race conditions in an
  actual multi-wallet browser session.
