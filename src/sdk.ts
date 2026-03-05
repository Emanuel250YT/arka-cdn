/**
 * ArkaCDN — bundled SDK re-exports.
 *
 * Everything you need to set up clients and utilities is available directly
 * from `arka-cdn`. You do **not** need to install `@arkiv-network/sdk` separately.
 *
 * @example
 * ```ts
 * import {
 *   ArkaCDN,
 *   createPublicClient,
 *   createWalletClient,
 *   privateKeyToAccount,
 *   kaolin,
 *   http,
 *   ExpirationTime,
 *   eq,
 * } from 'arka-cdn'
 * ```
 *
 * @module arka-cdn/sdk
 */

// ── Client factories ──────────────────────────────────────────────────────────
// `http`, `custom`, `createPublicClient`, `createWalletClient` — all the viem
// building blocks you need to set up ArkaCDN clients.
export {
  createPublicClient,
  createWalletClient,
  http,
  custom,
} from '@arkiv-network/sdk'

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
