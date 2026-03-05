/**
 * WalletPool manages a rotating pool of Arkiv wallet clients.
 *
 * Arkiv (like most EVM chains) uses per-account nonces, so a single wallet
 * can only submit one transaction at a time. Using N wallets lets us upload
 * N chunks concurrently without nonce collisions.
 *
 * Wallets are assigned in strict round-robin order; the pool is thread-safe
 * for concurrent JavaScript use (single-threaded event-loop).
 *
 * Uses `mutateEntities` for batched entity creation in a single transaction,
 * which is far more efficient than issuing N individual `createEntity` calls.
 */

import type {
  CreateEntityParameters,
  MutateEntitiesParameters,
  WalletArkivClient,
} from '@arkiv-network/sdk'
import type { WalletConfig } from '../types.js'

// ────────────────────────────────────────────────────────────────────────────
// Re-export SDK types used by the uploader so it doesn't import @arkiv-network/sdk
// ────────────────────────────────────────────────────────────────────────────

export type { CreateEntityParameters, MutateEntitiesParameters, WalletArkivClient }

/** Convenience alias for a single entity creation params object */
export type SdkCreateEntityParams = CreateEntityParameters

/** Alias for mutateEntities params */
export type SdkMutateEntitiesParams = MutateEntitiesParameters

/** Shape of the mutateEntities return value we care about */
export interface SdkMutateEntitiesResult {
  txHash: string
  createdEntities: string[]
}

/**
 * The `WalletArkivClient` from the SDK uses `account.address`.
 * We expose a thin adapter so the pool can expose a flat `.address` getter.
 */
export type { WalletArkivClient as ArkivWalletClient }

/**
 * Factory function type that builds a wallet client from a config.
 * Provided by the caller so the pool stays SDK-agnostic.
 */
export type WalletClientFactory = (
  config: WalletConfig,
) => WalletArkivClient | Promise<WalletArkivClient>

// ────────────────────────────────────────────────────────────────────────────
// WalletPool
// ────────────────────────────────────────────────────────────────────────────

export class WalletPool {
  /** Ordered client list kept for O(1) round-robin access */
  private readonly clients: WalletArkivClient[]
  /** Optional label map for named-wallet setups */
  private readonly labels: Map<string, WalletArkivClient>
  private cursor = 0

  private constructor(clients: WalletArkivClient[], labels?: Map<string, WalletArkivClient>) {
    if (clients.length === 0)
      throw new Error('WalletPool requires at least one wallet')
    this.clients = clients
    this.labels = labels ?? new Map()
  }

  // ── factory ────────────────────────────────────────────────────────────────

  /**
   * Builds a pool from an array of wallet configs and a factory function.
   *
   * ```ts
   * const pool = await WalletPool.create(
   *   [{ privateKey: '0x...' }],
   *   ({ privateKey }) => createWalletClient({
   *     account: privateKeyToAccount(privateKey),
   *     chain: kaolin,
   *     transport: http(),
   *   }),
   * )
   * ```
   */
  /**
   * Creates a pool from pre-built {@link WalletArkivClient} instances.
   *
   * Accepts:
   * - A single client
   * - An plain array of clients
   * - A `Map<label, client>` (most readable for multi-wallet setups)
   *
   * ```ts
   * // Single wallet
   * WalletPool.fromClients(new WalletClient({ account }))
   *
   * // Array
   * WalletPool.fromClients([wallet1, wallet2])
   *
   * // Named map
   * WalletPool.fromClients(new Map([
   *   ['primary',  new WalletClient({ account: primaryAccount  })],
   *   ['backup',   new WalletClient({ account: backupAccount   })],
   * ]))
   * ```
   */
  static fromClients(
    clients: WalletArkivClient | WalletArkivClient[] | Map<string, WalletArkivClient>,
  ): WalletPool {
    if (clients instanceof Map) {
      return new WalletPool(Array.from(clients.values()), clients)
    }
    const arr = Array.isArray(clients) ? clients : [clients]
    return new WalletPool(arr)
  }

  /**
   * Builds a pool from wallet configs and a factory function.
   * Useful when you want to defer client construction.
   */
  static async create(
    configs: WalletConfig[],
    factory: WalletClientFactory,
  ): Promise<WalletPool> {
    if (configs.length === 0)
      throw new Error('At least one WalletConfig is required')

    const clients = await Promise.all(configs.map(cfg => factory(cfg)))
    return new WalletPool(clients)
  }

  // ── public API ─────────────────────────────────────────────────────────────

  /** Total number of wallets in the pool */
  get size(): number {
    return this.clients.length
  }

  /** Addresses of all wallets in the pool */
  get addresses(): string[] {
    return this.clients.map(c => c.account?.address ?? 'unknown')
  }

  /**
   * Returns the wallet registered under the given label (Map-based pool only).
   * Returns `undefined` if no label map was provided or the key doesn't exist.
   */
  byLabel(label: string): WalletArkivClient | undefined {
    return this.labels.get(label)
  }

  /**
   * Returns the next wallet in round-robin order.
   * Consecutive calls cycle through all wallets before repeating.
   */
  next(): WalletArkivClient {
    const client = this.clients[this.cursor % this.clients.length]
    this.cursor = (this.cursor + 1) % this.clients.length
    return client!
  }

  /**
   * Executes `task` with a wallet from the pool.
   * Use this to automatically distribute work across wallets.
   */
  async run<T>(task: (wallet: WalletArkivClient) => Promise<T>): Promise<T> {
    const wallet = this.next()
    return task(wallet)
  }

  /**
   * Runs `tasks` in parallel, distributing each task across pool wallets.
   *
   * Order of results matches the order of `tasks`.
   */
  async runAll<T>(
    tasks: Array<(wallet: WalletArkivClient) => Promise<T>>,
  ): Promise<T[]> {
    return Promise.all(tasks.map(task => this.run(task)))
  }
}
