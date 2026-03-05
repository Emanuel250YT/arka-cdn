/**
 * arka-cdn
 *
 * High-level CDN client for the Arkiv network.
 * Provides a SOLID namespace API (`cdn.entity.*`, `cdn.file.*`),
 * MetaMask / browser wallet support, multi-wallet nonce distribution,
 * native gzip + FFmpeg media compression, live entity events, and P2P AES-256-CBC encryption.
 * Fully isomorphic — works in Node.js 18+ and modern browsers.
 *
 * All SDK helpers (`PublicClient`, `WalletClient`, `http`, `custom`,
 * `privateKeyToAccount`, `kaolin`, `ExpirationTime`, `eq`, …) are bundled —
 * you only need to install `arka-cdn`.
 *
 * @module arka-cdn
 */

// ── Bundled SDK re-exports ────────────────────────────────────────────
// PublicClient · WalletClient · http · custom · privateKeyToAccount
// kaolin (chain) · eq · gt · ExpirationTime · jsonToPayload … and more
export * from './sdk.js'

// ── Main client ───────────────────────────────────────────────────────────────
export { ArkaCDN, createArkaCDN } from './client.js'

// ── Services ──────────────────────────────────────────────────────────────────
export { EntityService } from './entity/index.js'
export { FileService } from './file/index.js'

// ── Entity watcher ────────────────────────────────────────────────────────────
export { EntityWatcher } from './entity/entity-watcher.js'
export type { WatcherEventMap, WatcherOptions } from './entity/entity-watcher.js'

// ── Errors ────────────────────────────────────────────────────────────────────
export {
  ArkaCDNError,
  ArkaCDNDownloadError,
  ArkaCDNEntityError,
  ArkaCDNUploadError,
} from './errors.js'

// ── Compression ──────────────────────────────────────────────────────────────
// Gzip: compress, decompress, isCompressible
// FFmpeg (Node.js only): MediaCompressor, isMediaCompressible
export {
  compress,
  decompress,
  isCompressible,
  MediaCompressor,
  isMediaCompressible,
} from './compress/index.js'
export type {
  MediaCompressOptions,
  ImageOptimizeOptions,
  GifOptimizeOptions,
  VideoOptimizeOptions,
} from './compress/index.js'

// ── Types ─────────────────────────────────────────────────────────────────────
export type {
  ArkaCDNConfig,
  Base64String,
  Chunk,
  ChunkAttributes,
  ChunkPayload,
  DownloadOptions,
  DownloadProgress,
  DownloadResult,
  EncryptedChunk,
  EncryptedData,
  EncryptionOptions,
  EntityKey,
  ExtendEntityOptions,
  FileManifest,
  HexString,
  UploadOptions,
  UploadProgress,
  UploadResult,
  UUID,
} from './types.js'

// ── Upload utilities ──────────────────────────────────────────────────────────
export {
  assemble,
  DEFAULT_CHUNK_SIZE,
  split,
  toPayload,
  toUint8Array,
  Uploader,
  WalletPool,
} from './upload/index.js'
export type {
  ArkivWalletClient,
  SdkCreateEntityParams,
  SdkMutateEntitiesParams,
  SdkMutateEntitiesResult,
  WalletClientFactory,
} from './upload/index.js'

// ── Download utilities ────────────────────────────────────────────────────────
export { Downloader } from './download/index.js'

// ── Crypto ────────────────────────────────────────────────────────────────────
export { decrypt, decryptString, encrypt, encryptString } from './crypto/index.js'

// ── Utils ─────────────────────────────────────────────────────────────────────
export { generateUUID, shortId } from './utils/index.js'

// ── Backward-compat aliases (deprecated) ─────────────────────────────────────
/** @deprecated Use {@link ArkaCDN} */
export { ArkaCDN as ArkivCDN } from './client.js'
