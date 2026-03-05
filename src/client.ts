/**
 * ArkaCDN – high-level client for storing and retrieving files on Arkiv.
 *
 * The API is split into two namespaces:
 *
 *  - **`cdn.entity`** – low-level Arkiv entity operations (CRUD, query, watch).
 *  - **`cdn.file`** – high-level CDN operations (chunked upload / download,
 *    encryption, multi-wallet parallel throughput).
 *
 * ### Quick start – Browser / MetaMask
 * ```ts
 * import { createPublicClient, createWalletClient, custom, http } from '@arkiv-network/sdk'
 * import { kaolin } from '@arkiv-network/sdk/chains'
 * import { ArkaCDN } from 'arka-cdn'
 *
 * await window.ethereum.request({ method: 'eth_requestAccounts' })
 *
 * const cdn = ArkaCDN.create({
 *   publicClient: createPublicClient({ chain: kaolin, transport: http() }),
 *   wallets: createWalletClient({ chain: kaolin, transport: custom(window.ethereum) }),
 * })
 *
 * const { manifestKey } = await cdn.file.upload(file)
 * const { data } = await cdn.file.download(manifestKey)
 * ```
 *
 * ### Quick start – Node.js
 * ```ts
 * import { createPublicClient, createWalletClient, http } from '@arkiv-network/sdk'
 * import { privateKeyToAccount } from '@arkiv-network/sdk/accounts'
 * import { kaolin } from '@arkiv-network/sdk/chains'
 * import { ArkaCDN } from 'arka-cdn'
 *
 * const cdn = ArkaCDN.create({
 *   publicClient: createPublicClient({ chain: kaolin, transport: http() }),
 *   wallets: createWalletClient({
 *     account: privateKeyToAccount(process.env.PRIVATE_KEY!),
 *     chain: kaolin,
 *     transport: http(),
 *   }),
 * })
 * ```
 */

import type { ArkaCDNConfig } from './types.js'
import type {
  Attribute,
  Entity,
  PublicArkivClient,
  WalletArkivClient,
} from '@arkiv-network/sdk'
import { EntityService } from './entity/entity-service.js'
import { FileService } from './file/file-service.js'
import { DEFAULT_CHUNK_SIZE } from './upload/chunker.js'
import { Downloader } from './download/downloader.js'
import { Uploader } from './upload/uploader.js'
import { WalletPool } from './upload/wallet-pool.js'

// ── Re-exports ────────────────────────────────────────────────────────────────────────────
export type { Attribute, Entity, PublicArkivClient, WalletArkivClient }
export type { PublicArkivClient as ArkivPublicClient }

// ── ArkaCDN ───────────────────────────────────────────────────────────────────────────────

export class ArkaCDN {
  /**
   * Low-level entity operations.
   * - `cdn.entity.create(params)`
   * - `cdn.entity.update(params)`
   * - `cdn.entity.delete(params)`
   * - `cdn.entity.extend(params)` – `additionalTime` in seconds
   * - `cdn.entity.batch(params)` – mutate multiple entities in one TX
   * - `cdn.entity.get(key)`
   * - `cdn.entity.query()` – returns a `QueryBuilder`
   * - `cdn.entity.watch(options)` – subscribe to on-chain events
   */
  readonly entity: EntityService

  /**
   * High-level CDN file operations.
   * - `cdn.file.upload(input, options?)`
   * - `cdn.file.download(manifestKey, options?)`
   * - `cdn.file.manifest(manifestKey)`
   */
  readonly file: FileService

  /** The underlying wallet pool (exposed for advanced orchestration). */
  readonly pool: WalletPool

  /** The Arkiv public client passed at construction. */
  readonly publicClient: PublicArkivClient

  private constructor(
    pool: WalletPool,
    publicClient: PublicArkivClient,
    entityService: EntityService,
    fileService: FileService,
  ) {
    this.pool = pool
    this.publicClient = publicClient
    this.entity = entityService
    this.file = fileService
  }

  /**
   * Creates an {@link ArkaCDN} instance from pre-built Arkiv clients.
   *
   * Supports MetaMask, private-key wallets, and multi-wallet setups.
   */
  static create(config: ArkaCDNConfig): ArkaCDN {
    const walletArr = Array.isArray(config.wallets)
      ? config.wallets
      : [config.wallets]

    const pool = WalletPool.fromClients(walletArr)
    const maxChunkSize = config.maxChunkSize ?? DEFAULT_CHUNK_SIZE
    const defaultExpiresIn = config.defaultExpiresIn

    const uploader = new Uploader(pool, maxChunkSize, defaultExpiresIn)
    const downloader = new Downloader(config.publicClient)
    const entityService = new EntityService(pool, config.publicClient)
    const fileService = new FileService(uploader, downloader)

    return new ArkaCDN(pool, config.publicClient, entityService, fileService)
  }
}

// ── Aliases & convenience exports ────────────────────────────────────────────────────────

/** Backward-compatible alias for {@link ArkaCDN}. */
export { ArkaCDN as ArkivCDN }

/** Convenience factory – equivalent to `ArkaCDN.create(config)`. */
export function createArkaCDN(config: ArkaCDNConfig): ArkaCDN {
  return ArkaCDN.create(config)
}
