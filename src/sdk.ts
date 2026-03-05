/**
 * ArkaCDN — bundled SDK re-exports.
 *
 * Everything you need to set up clients and utilities is available directly
 * from `arka-cdn`. You do **not** need to install `@arkiv-network/sdk` separately.
 *
 * @example Minimal setup — chain and transport default to kaolin + http
 * ```ts
 * import { ArkaCDN, PublicClient, WalletClient, privateKeyToAccount } from 'arka-cdn'
 *
 * const cdn = ArkaCDN.create({
 *   publicClient: new PublicClient(),
 *   wallets: new WalletClient({ account: privateKeyToAccount(process.env.PRIVATE_KEY!) }),
 * })
 * ```
 *
 * @module arka-cdn/sdk
 */

import {
  createPublicClient as _createPublicClient,
  createWalletClient as _createWalletClient,
  http,
  custom,
} from '@arkiv-network/sdk'
import type { PublicArkivClient, WalletArkivClient } from '@arkiv-network/sdk'
import { kaolin } from '@arkiv-network/sdk/chains'

// ── Transport helpers ─────────────────────────────────────────────────────────
export { http, custom }

// ── Sensible defaults ─────────────────────────────────────────────────────────
// All clients default to the Arkiv testnet (kaolin) + HTTP transport.
// Override any field by passing it explicitly.
const _clientDefaults = {
  chain: kaolin,
  transport: http(),
} as const

// ── OOP-style client constructors ─────────────────────────────────────────────
// The underlying SDK exposes plain factory functions. We wrap them with:
//  • defaults: chain=kaolin, transport=http()   (no args needed for read-only use)
//  • constructor syntax: `new PublicClient()` / `new PublicClient({ ... })`
// JavaScript constructors return the factory's object directly when it's
// non-primitive — so no Proxy / subclassing tricks needed.

type PublicClientConfig = Partial<Parameters<typeof _createPublicClient>[0]>
type WalletClientConfig = Partial<Parameters<typeof _createWalletClient>[0]>

function _publicClientFactory(config: PublicClientConfig = {}): PublicArkivClient {
  return _createPublicClient({ ..._clientDefaults, ...config } as Parameters<typeof _createPublicClient>[0])
}

function _walletClientFactory(config: WalletClientConfig = {}): WalletArkivClient {
  return _createWalletClient({ ..._clientDefaults, ...config } as Parameters<typeof _createWalletClient>[0])
}

/**
 * Read-only Arkiv client. Defaults to `kaolin` chain + `http()` transport.
 *
 * @example Minimal — no args needed for default network
 * ```ts
 * const publicClient = new PublicClient()
 * ```
 *
 * @example Custom transport (MetaMask / browser)
 * ```ts
 * const publicClient = new PublicClient({ transport: custom(window.ethereum) })
 * ```
 */
export const PublicClient = _publicClientFactory as unknown as {
  new(config?: PublicClientConfig): PublicArkivClient
}

/**
 * Wallet (signer) Arkiv client. Defaults to `kaolin` chain + `http()` transport.
 *
 * @example Private key (Node.js / backend)
 * ```ts
 * const walletClient = new WalletClient({
 *   account: privateKeyToAccount(process.env.PRIVATE_KEY!),
 * })
 * ```
 *
 * @example Browser wallet (MetaMask)
 * ```ts
 * const walletClient = new WalletClient({ transport: custom(window.ethereum) })
 * ```
 */
export const WalletClient = _walletClientFactory as unknown as {
  new(config?: WalletClientConfig): WalletArkivClient
}

// ── Common viem types ─────────────────────────────────────────────────────────
export type {
  Chain,
  Transport,
  Account,
  Hex,
  Address,
} from '@arkiv-network/sdk'

// ── Arkiv-specific client types ───────────────────────────────────────────────
export type {
  PublicArkivClient,
  WalletArkivClient,
  Entity,
  Attribute,
  CreateEntityParameters,
  CreateEntityReturnType,
  UpdateEntityParameters,
  UpdateEntityReturnType,
  DeleteEntityParameters,
  DeleteEntityReturnType,
  ExtendEntityParameters,
  ExtendEntityReturnType,
  MutateEntitiesParameters,
  MutateEntitiesReturnType,
  OnEntityCreatedEvent,
  OnEntityUpdatedEvent,
  OnEntityDeletedEvent,
  OnEntityExpiredEvent,
  OnEntityExpiresInExtendedEvent,
} from '@arkiv-network/sdk'

// ── Chains ────────────────────────────────────────────────────────────────────
// e.g. `kaolin` — import { kaolin } from 'arka-cdn'
export * from '@arkiv-network/sdk/chains'

// ── Accounts ──────────────────────────────────────────────────────────────────
// `privateKeyToAccount`, `mnemonicToAccount`, `generatePrivateKey`, etc.
export * from '@arkiv-network/sdk/accounts'

// ── Query filter helpers ──────────────────────────────────────────────────────
// `eq`, `gt`, `gte`, `lt`, `lte`, `neq`, `not`, `and`, `or`, `asc`, `desc`
export {
  eq,
  gt,
  gte,
  lt,
  lte,
  neq,
  not,
  and,
  or,
  asc,
  desc,
  QueryBuilder,
  QueryResult,
} from '@arkiv-network/sdk/query'

// ── Utils ─────────────────────────────────────────────────────────────────────
// `ExpirationTime.fromDays(7)` etc., `jsonToPayload`, `stringToPayload`
export { ExpirationTime, jsonToPayload, stringToPayload } from '@arkiv-network/sdk/utils'
