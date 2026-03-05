/**
 * Uploader – orchestrates chunking, optional encryption, and parallel
 * multi-wallet entity creation on Arkiv.
 *
 * Upload lifecycle:
 *  1. Convert input → Uint8Array
 *  2. Split into ≤64 KB chunks (current Arkiv network payload limit)
 *  3. Optionally encrypt each chunk (AES-256-CBC / PBKDF2)
 *  4. Distribute chunks equally across pool wallets
 *  5. Each wallet calls `mutateEntities` with its batch in ONE transaction
 *     → no nonce conflicts, minimum on-chain transactions
 *  6. Upload the FileManifest entity
 *  7. Return an UploadResult
 */

import type {
  Chunk,
  EncryptedChunk,
  FileManifest,
  UploadOptions,
  UploadResult,
} from '../types.js'
import { encrypt } from '../crypto/aes.js'
import { compress, isCompressible } from '../compress/index.js'
import { generateUUID } from '../utils/uuid.js'
import { DEFAULT_CHUNK_SIZE, split, toUint8Array } from './chunker.js'
import type {
  SdkCreateEntityParams,
  WalletPool,
} from './wallet-pool.js'
import type { WalletArkivClient } from '@arkiv-network/sdk'

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

const CHUNK_CATEGORY = 'arkiv-cdn:chunk'
const MANIFEST_CATEGORY = 'arkiv-cdn:manifest'

/**
 * Default entity lifetime in seconds (~30 days).
 */
const DEFAULT_EXPIRES_IN = 30 * 24 * 60 * 60

// ────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────────────────────────────────

/** Serialise an object to a UTF-8 Uint8Array (mirrors SDK's `jsonToPayload`). */
export function toPayload(value: object): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value))
}

/** Encode Uint8Array bytes to hex string for deterministic storage */
function uint8ToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

async function encryptChunk(
  chunk: Chunk,
  phrase: string,
  secret: string,
): Promise<EncryptedChunk> {
  const encrypted = await encrypt(chunk.bytes, phrase, secret)
  const { bytes: _bytes, ...rest } = chunk
  return { ...rest, data: encrypted.data, salt: encrypted.salt, iv: encrypted.iv }
}

/**
 * Builds an `SdkCreateEntityParams`-compatible object for a single chunk.
 * Attributes use flat `{ key, value }` pairs to match the Arkiv SDK Attribute type.
 */
function buildChunkEntityParams(
  chunk: Chunk | EncryptedChunk,
  expiresIn: number,
): SdkCreateEntityParams {
  const isEncrypted = 'salt' in chunk
  const enc = chunk as EncryptedChunk

  const payloadHex = isEncrypted
    ? enc.data
    : uint8ToHex((chunk as Chunk).bytes)

  const attributes: Array<{ key: string; value: string | number }> = [
    { key: 'cdn.part', value: chunk.part },
    { key: 'cdn.total', value: chunk.total },
    { key: 'cdn.uuid', value: chunk.uuid },
    { key: 'cdn.entity', value: chunk.entity },
    { key: 'cdn.encrypted', value: isEncrypted ? '1' : '0' },
    ...(isEncrypted
      ? [
        { key: 'cdn.salt', value: enc.salt },
        { key: 'cdn.iv', value: enc.iv },
      ]
      : []),
  ]

  return {
    payload: toPayload({ data: payloadHex }),
    attributes,
    contentType: CHUNK_CATEGORY,
    expiresIn,
  }
}

/**
 * Distributes an array into N buckets in round-robin order.
 * Used to assign equal numbers of chunks to each wallet.
 */
function distribute<T>(items: T[], buckets: number): T[][] {
  const n = Math.min(buckets, items.length)
  const result: T[][] = Array.from({ length: n }, () => [])
  for (let i = 0; i < items.length; i++) {
    result[i % n]!.push(items[i]!)
  }
  return result
}

// ────────────────────────────────────────────────────────────────────────────
// Uploader class
// ────────────────────────────────────────────────────────────────────────────

export class Uploader {
  constructor(
    private readonly pool: WalletPool,
    private readonly maxChunkSize: number = DEFAULT_CHUNK_SIZE,
    private readonly expiresIn: number = DEFAULT_EXPIRES_IN,
  ) { }

  /**
   * Uploads a file or binary blob to Arkiv, transparently handling:
   *  - Chunking (≤ maxChunkSize per chunk)
   *  - Parallel upload via multiple wallets using `mutateEntities` batching
   *  - Optional AES-256-CBC encryption per chunk
   *  - FileManifest creation for fast reassembly
   *
   * @param input    File / Blob (browser) or Uint8Array / ArrayBuffer (Node)
   * @param options  Upload options (encryption, progress callback, etc.)
   */
  async upload(
    input: File | Blob | Uint8Array | ArrayBuffer,
    options: UploadOptions = {},
  ): Promise<UploadResult> {
    const {
      filename = resolveFilename(input),
      mimeType = resolveMimeType(input),
      encryption,
      onProgress,
      compress: compressOption,
    } = options

    // 1 ─ Convert to raw bytes
    const rawBytes = await toUint8Array(input)

    // 2 ─ Optionally compress before chunking
    const shouldCompress
      = compressOption === true
      || (compressOption === 'auto' && isCompressible(mimeType))
    const bytes = shouldCompress ? await compress(rawBytes) : rawBytes

    // 3 ─ Assign a master UUID for the whole file
    const entityId = generateUUID()

    // 4 ─ Split into chunks (using compressed bytes if compression was applied)
    const rawChunks = split(bytes, entityId, this.maxChunkSize)

    // 5 ─ Encrypt if requested
    const uploadChunks: Array<Chunk | EncryptedChunk> = encryption
      ? await Promise.all(
        rawChunks.map(c => encryptChunk(c, encryption.phrase, encryption.secret)),
      )
      : rawChunks

    // 6 ─ Distribute chunks across wallets, one mutateEntities tx per wallet
    const walletBatches = distribute(uploadChunks, this.pool.size)
    const wallets: WalletArkivClient[] = Array.from(
      { length: walletBatches.length },
      () => this.pool.next(),
    )

    let uploadedCount = 0
    const chunkKeysByBatch: string[][] = new Array(walletBatches.length)

    await Promise.all(
      walletBatches.map(async (batch, bi) => {
        const wallet = wallets[bi]!
        const creates = batch.map(c => buildChunkEntityParams(c, this.expiresIn))
        const result = await wallet.mutateEntities({ creates })
        // result.createdEntities is Hex[] in the real SDK
        chunkKeysByBatch[bi] = result.createdEntities as string[]

        uploadedCount += batch.length
        onProgress?.({
          uploaded: uploadedCount,
          total: uploadChunks.length,
          ratio: uploadedCount / uploadChunks.length,
          currentChunk: uploadedCount - 1,
        })
      }),
    )

    // Restore original chunk order from the distributed batches
    const chunkKeys: string[] = new Array(uploadChunks.length)
    for (let bi = 0; bi < walletBatches.length; bi++) {
      const batch = walletBatches[bi]!
      const keys = chunkKeysByBatch[bi]!
      for (let j = 0; j < batch.length; j++) {
        // Bucket bi holds original indices: bi, bi+n, bi+2n, ...
        chunkKeys[bi + j * walletBatches.length] = keys[j]!
      }
    }

    // 6 ─ Build and persist the manifest
    const manifest: FileManifest = {
      entityId,
      filename,
      mimeType,
      size: rawBytes.length,   // store ORIGINAL uncompressed size
      totalParts: uploadChunks.length,
      chunks: uploadChunks.map(c => c.uuid),
      encrypted: !!encryption,
      compressed: shouldCompress,
      createdAt: new Date().toISOString(),
      uploader: wallets[0]!.account?.address ?? 'unknown',
    }

    const manifestResult = await this.pool.run(wallet =>
      wallet.mutateEntities({
        creates: [
          {
            payload: toPayload(manifest as unknown as object),
            contentType: MANIFEST_CATEGORY,
            expiresIn: this.expiresIn,
            attributes: [
              { key: 'cdn.entityId', value: manifest.entityId },
              { key: 'cdn.filename', value: manifest.filename },
              { key: 'cdn.mimeType', value: manifest.mimeType },
              { key: 'cdn.totalParts', value: manifest.totalParts },
              { key: 'cdn.encrypted', value: manifest.encrypted ? '1' : '0' },
            ],
          },
        ],
      }),
    )

    const manifestKey = manifestResult.createdEntities[0]!

    return {
      entityId,
      manifestKey,
      chunks: manifest.chunks,
      encrypted: manifest.encrypted,
      filename,
      mimeType,
      size: rawBytes.length,  // original uncompressed size
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function resolveFilename(input: File | Blob | Uint8Array | ArrayBuffer): string {
  if (typeof File !== 'undefined' && input instanceof File)
    return input.name
  return 'file'
}

function resolveMimeType(input: File | Blob | Uint8Array | ArrayBuffer): string {
  if (typeof Blob !== 'undefined' && input instanceof Blob && input.type)
    return input.type
  return 'application/octet-stream'
}
