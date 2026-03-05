import type {
  Chain,
  OnEntityCreatedEvent,
  OnEntityDeletedEvent,
  OnEntityExpiredEvent,
  OnEntityExpiresInExtendedEvent,
  OnEntityUpdatedEvent,
  PublicArkivClient,
  WalletArkivClient,
} from '@arkiv-network/sdk'

// ────────────────────────────────────────────────────────────────────────────
// Primitives
// ────────────────────────────────────────────────────────────────────────────

/** Hex string (no 0x prefix) */
export type HexString = string

/** Base64url-encoded binary data */
export type Base64String = string

/** RFC-4122 UUID string */
export type UUID = string

/** Arkiv entity key (0x-prefixed hash) */
export type EntityKey = string

// ────────────────────────────────────────────────────────────────────────────
// Chunk model
// ────────────────────────────────────────────────────────────────────────────

/**
 * Raw descriptor attached to every chunk entity stored on-chain.
 * Attributes are kept minimal so they fit inside the 16 KB limit.
 */
export interface ChunkAttributes {
  /** Zero-based chunk index */
  part: number
  /** Total number of chunks for this file */
  total: number
  /** Unique UUID for THIS chunk – enables O(1) lookup */
  uuid: UUID
  /** UUID of the parent file entity – lets you enumerate all chunks */
  entity: UUID
  /** AES salt (hex) – only present when the chunk is encrypted */
  salt?: HexString
  /** AES IV (hex) – only present when the chunk is encrypted */
  iv?: HexString
}

/** Serialised chunk ready to be persisted as an Arkiv entity payload */
export interface ChunkPayload {
  /** Hex- or base64-encoded (possibly encrypted) bytes */
  data: string
}

/** In-memory representation produced by the chunker */
export interface Chunk {
  /** Zero-based index */
  part: number
  /** Total chunks count */
  total: number
  /** Unique chunk UUID */
  uuid: UUID
  /** Parent file UUID */
  entity: UUID
  /** Raw binary data (before encryption) */
  bytes: Uint8Array
}

/** Chunk already encrypted and ready for upload */
export interface EncryptedChunk extends Omit<Chunk, 'bytes'> {
  /** Hex-encoded encrypted bytes */
  data: HexString
  /** PBKDF2 salt used to derive the key (hex) */
  salt: HexString
  /** AES-CBC initialisation vector (hex) */
  iv: HexString
}

// ────────────────────────────────────────────────────────────────────────────
// File manifest
// ────────────────────────────────────────────────────────────────────────────

/**
 * Top-level entity persisted after all chunks are uploaded.
 * Lets any consumer reassemble the file without iterating all entities.
 */
export interface FileManifest {
  /** UUID that links ALL chunks together */
  entityId: UUID
  /** Arkiv entity key of the manifest itself (set after upload) */
  manifestKey?: EntityKey
  /** Original filename */
  filename: string
  /** MIME type */
  mimeType: string
  /** Original file size in bytes */
  size: number
  /** Total number of chunks */
  totalParts: number
  /** Ordered array of chunk UUIDs */
  chunks: UUID[]
  /** Whether the chunks are encrypted */
  encrypted: boolean
  /** Whether the data was gzip-compressed before chunking */
  compressed?: boolean
  /** ISO timestamp of the upload */
  createdAt: string
  /** Wallet address that created the manifest */
  uploader?: string
}

// ────────────────────────────────────────────────────────────────────────────
// Encryption
// ────────────────────────────────────────────────────────────────────────────

export interface EncryptionOptions {
  /**
   * Public phrase shared among authorised parties.
   * Combined with `secret` to derive the AES key.
   */
  phrase: string
  /**
   * Private secret kept by the uploader.
   * Must be shared out-of-band to grant decryption access.
   */
  secret: string
}

export interface EncryptedData {
  /** Hex-encoded ciphertext */
  data: HexString
  /** PBKDF2 salt (hex, 16 bytes) */
  salt: HexString
  /** AES-CBC IV (hex, 16 bytes) */
  iv: HexString
}

// ────────────────────────────────────────────────────────────────────────────
// Upload
// ────────────────────────────────────────────────────────────────────────────

export interface UploadProgress {
  /** Number of chunks successfully uploaded */
  uploaded: number
  /** Total chunks to upload */
  total: number
  /** Progress as a [0, 1] ratio */
  ratio: number
  /** Most-recently completed chunk part number */
  currentChunk: number
}

import type { MediaCompressOptions } from './compress/media-compressor.js'
export type { MediaCompressOptions }

export interface UploadOptions {
  /** Optional filename override (defaults to File/Blob name) */
  filename?: string
  /** Optional MIME-type override */
  mimeType?: string
  /** When provided, every chunk is AES-256-CBC encrypted */
  encryption?: EncryptionOptions
  /** Called after each chunk is confirmed on-chain */
  onProgress?: (progress: UploadProgress) => void
  /**
   * Number of chunks to upload concurrently PER WALLET.
   * Defaults to 1 (sequential per wallet, parallel across wallets).
   */
  concurrency?: number
  /**
   * Compress / optimise the file before uploading.
   *
   * - `true`   — gzip (always)
   * - `'auto'` — gzip for text/JSON/XML; FFmpeg for media (images, GIFs, video)
   *              when running in Node.js with `fluent-ffmpeg` installed
   * - `false`  — no compression (default)
   * - `MediaCompressOptions` — FFmpeg with explicit per-type options
   *
   * @example Gzip a JSON report
   * ```ts
   * await cdn.file.upload(buf, { mimeType: 'application/json', compress: true })
   * ```
   *
   * @example Auto-select best compressor
   * ```ts
   * await cdn.file.upload(file, { compress: 'auto' })
   * ```
   *
   * @example Resize an image to 800 px wide at 75 % quality
   * ```ts
   * await cdn.file.upload(img, {
   *   mimeType: 'image/jpeg',
   *   compress: { image: { width: 800, quality: 75 } },
   * })
   * ```
   *
   * @example Optimise a GIF
   * ```ts
   * await cdn.file.upload(gif, {
   *   mimeType: 'image/gif',
   *   compress: { gif: { width: 480, fps: 10, colors: 64 } },
   * })
   * ```
   */
  compress?: boolean | 'auto' | MediaCompressOptions
}

export interface UploadResult {
  /** UUID that ties all chunks together */
  entityId: UUID
  /** On-chain key of the manifest entity */
  manifestKey: EntityKey
  /** Ordered chunk UUIDs */
  chunks: UUID[]
  /** Whether the content was encrypted */
  encrypted: boolean
  filename: string
  mimeType: string
  size: number
}

// ────────────────────────────────────────────────────────────────────────────
// Download
// ────────────────────────────────────────────────────────────────────────────

export interface DownloadProgress {
  /** Chunks fetched so far */
  fetched: number
  /** Total chunks to fetch */
  total: number
  /** Progress as a [0, 1] ratio */
  ratio: number
}

export interface DownloadOptions {
  /** Must be provided if the file was uploaded with encryption */
  encryption?: EncryptionOptions
  /** Called after each chunk is fetched */
  onProgress?: (progress: DownloadProgress) => void
}

export interface DownloadResult {
  /** Reassembled file data */
  data: Uint8Array
  /** Filename extracted from the manifest */
  filename: string
  /** MIME type extracted from the manifest */
  mimeType: string
  /** Original file size in bytes */
  size: number
  manifest: FileManifest
}

// ────────────────────────────────────────────────────────────────────────────
// Wallet pool
// ────────────────────────────────────────────────────────────────────────────

export interface WalletConfig {
  /** Private key in 0x-prefixed hex format */
  privateKey: `0x${string}`
}

// ────────────────────────────────────────────────────────────────────────────
// Client configuration
// ────────────────────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────────────────────
// Entity operations
// ────────────────────────────────────────────────────────────────────────────

/**
 * Options for extending an entity's lifetime.
 * Use `ExpirationTime` helpers from `@arkiv-network/sdk/utils` to build the value.
 *
 * @example
 * import { ExpirationTime } from '@arkiv-network/sdk/utils'
 * await cdn.entity.extend({ entityKey: '0x...', additionalTime: ExpirationTime.fromDays(7) })
 */
export interface ExtendEntityOptions {
  /** On-chain key of the entity to extend */
  entityKey: `0x${string}`
  /** Extra seconds to add to the current expiry */
  additionalTime: number
}

/** Options passed to `cdn.entity.watch()` */
export interface WatchEntityOptions {
  onCreated?: (event: OnEntityCreatedEvent) => void
  onUpdated?: (event: OnEntityUpdatedEvent) => void
  onDeleted?: (event: OnEntityDeletedEvent) => void
  /** Fires when an entity's expiry block is passed */
  onExpired?: (event: OnEntityExpiredEvent) => void
  /** Fires when an entity's TTL is extended */
  onExpiresInExtended?: (event: OnEntityExpiresInExtendedEvent) => void
  onError?: (error: Error) => void
  /** Polling interval in milliseconds (default: 2000) */
  pollingInterval?: number
  /** Block number to start listening from */
  fromBlock?: bigint
}

// Re-export SDK event types so consumers don't need a direct SDK dependency
export type {
  OnEntityCreatedEvent,
  OnEntityDeletedEvent,
  OnEntityExpiredEvent,
  OnEntityExpiresInExtendedEvent,
  OnEntityUpdatedEvent,
}

// ────────────────────────────────────────────────────────────────────────────
// Client configuration
// ────────────────────────────────────────────────────────────────────────────

/**
 * Configuration for {@link ArkaCDN}.
 *
 * Pass pre-built Arkiv clients (supports MetaMask, private-key wallets, and
 * multi-wallet setups out of the box).
 *
 * @example MetaMask
 * ```ts
 * const cdn = ArkaCDN.create({
 *   publicClient: createPublicClient({ chain: kaolin, transport: http() }),
 *   wallets: createWalletClient({ chain: kaolin, transport: custom(window.ethereum) }),
 * })
 * ```
 *
 * @example Multi-wallet with a named Map
 * ```ts
 * const cdn = ArkaCDN.create({
 *   publicClient: new PublicClient(),
 *   wallets: new Map([
 *     ['primary',   new WalletClient({ account: privateKeyToAccount(key1) })],
 *     ['secondary', new WalletClient({ account: privateKeyToAccount(key2) })],
 *   ]),
 * })
 * ```
 */
export interface ArkaCDNConfig {
  /** Read-only Arkiv public client */
  publicClient: PublicArkivClient
  /**
   * Wallet client(s) used for write operations.
   *
   * - Single client: `new WalletClient({ account })`
   * - Array: `[wallet1, wallet2]`
   * - Named Map (most readable): `new Map([['primary', wallet1], ['backup', wallet2]])`
   */
  wallets: WalletArkivClient | WalletArkivClient[] | Map<string, WalletArkivClient>
  /**
   * Maximum bytes per chunk.
   * Defaults to {@link DEFAULT_CHUNK_SIZE} (64 KB — current Arkiv network limit).
   * Reduce this if you need extra head-room for attributes overhead.
   */
  maxChunkSize?: number
  /**
   * Default entity TTL in seconds.
   * Use `ExpirationTime` helpers from `@arkiv-network/sdk/utils` to build the value.
   * Defaults to 30 days.
   */
  defaultExpiresIn?: number
}

/** @deprecated Use {@link ArkaCDNConfig} instead */
export interface ArkivCDNConfig {
  /** Arkiv chain descriptor (e.g. `kaolin`) */
  chain: Chain
  /** RPC transport */
  transport?: unknown
  /**
   * One or more wallets (private-key based).
   * @deprecated Pass pre-built `WalletArkivClient` instances via `ArkaCDNConfig.wallets` instead.
   */
  wallets: [WalletConfig, ...WalletConfig[]]
  maxChunkSize?: number
}
