/**
 * Downloader – fetches all chunks for a file from Arkiv and reassembles them.
 *
 * Download lifecycle:
 *  1. Fetch the FileManifest entity by its on-chain key
 *  2. Decode the JSON payload of the manifest (Uint8Array → FileManifest)
 *  3. Fetch all chunk entities in parallel, queried by their `cdn.uuid` attribute
 *  4. Optionally decrypt each chunk (AES-256-CBC / PBKDF2)
 *  5. Sort chunks by `part` and assemble into the original binary
 *  6. Return a DownloadResult with the full file data + metadata
 *
 * SDK entity structure:
 *  - entity.payload    → Uint8Array | undefined  (JSON-encoded by us)
 *  - entity.attributes → Array<{ key: string; value: string | number }>
 */

import type {
  DownloadOptions,
  DownloadResult,
  EncryptedData,
  FileManifest,
} from '../types.js'
import { decrypt } from '../crypto/aes.js'
import { decompress } from '../compress/index.js'
import { assemble } from '../upload/chunker.js'
import { eq } from '@arkiv-network/sdk/query'
import type { ArkivPublicClient } from '../client.js'

// ────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────────────────────────────────

/** Decode a JSON-encoded Uint8Array payload back into a typed object */
function decodePayload<T>(bytes: Uint8Array | undefined): T {
  if (!bytes || bytes.length === 0)
    throw new Error('Entity has no payload')
  return JSON.parse(new TextDecoder().decode(bytes)) as T
}

/** Look up an attribute value from the flat SDK Attribute[] array */
function attr(
  attributes: Array<{ key: string; value: string | number }>,
  key: string,
): string | number | undefined {
  return attributes.find(a => a.key === key)?.value
}

function attrStr(
  attributes: Array<{ key: string; value: string | number }>,
  key: string,
): string | undefined {
  const v = attr(attributes, key)
  return v !== undefined ? String(v) : undefined
}

function attrNum(
  attributes: Array<{ key: string; value: string | number }>,
  key: string,
): number | undefined {
  const v = attr(attributes, key)
  return v !== undefined ? Number(v) : undefined
}

/** Decode a hex string → Uint8Array */
function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

// ────────────────────────────────────────────────────────────────────────────
// Downloader class
// ────────────────────────────────────────────────────────────────────────────

export class Downloader {
  constructor(private readonly client: ArkivPublicClient) { }

  /**
   * Fetches the {@link FileManifest} entity stored at `manifestKey`.
   * The manifest contains the ordered list of chunk UUIDs needed to rebuild
   * the original file.
   */
  async fetchManifest(manifestKey: string): Promise<FileManifest> {
    const entity = await this.client.getEntity(manifestKey as `0x${string}`)
    if (!entity)
      throw new Error(`Manifest entity not found: ${manifestKey}`)

    // Payload is Uint8Array – we stored the FileManifest as JSON
    const payload = decodePayload<FileManifest>(entity.payload)
    return { ...payload, manifestKey }
  }

  /**
   * Downloads a file by its manifest key and reassembles all chunks.
   *
   * @param manifestKey  On-chain key of the FileManifest entity
   * @param options      Optional decryption credentials and progress callback
   */
  async download(
    manifestKey: string,
    options: DownloadOptions = {},
  ): Promise<DownloadResult> {
    const { encryption, onProgress } = options

    // 1 ─ Load manifest
    const manifest = await this.fetchManifest(manifestKey)

    const total = manifest.totalParts
    let fetched = 0

    // 2 ─ Fetch all chunks in parallel, each queried by its `cdn.uuid` attribute
    const chunkEntities = await Promise.all(
      manifest.chunks.map(async (chunkUUID) => {
        const results = await this.client
          .buildQuery()
          .where(eq('cdn_uuid', chunkUUID))  // O(1) attribute-indexed lookup
          .withAttributes(true)
          .withPayload(true)
          .limit(1)
          .fetch()

        const entity = results.entities[0]
        if (!entity)
          throw new Error(`Chunk entity not found for cdn.uuid=${chunkUUID}`)

        fetched++
        onProgress?.({ fetched, total, ratio: fetched / total })

        return entity
      }),
    )

    // 3 ─ Decode / decrypt each chunk
    const chunks = await Promise.all(
      chunkEntities.map(async (entity) => {
        const attributes: Array<{ key: string; value: string | number }>
          = (entity.attributes as Array<{ key: string; value: string | number }>) ?? []

        const chunk = attrNum(attributes, 'cdn_chunk') ?? 0
        const total2 = attrNum(attributes, 'cdn_total') ?? 1
        const uuid = attrStr(attributes, 'cdn_uuid') ?? ''
        const entityId = attrStr(attributes, 'cdn_entity') ?? ''
        const isEncrypted = attrStr(attributes, 'cdn_encrypted') === '1'

        // Payload is JSON: { data: hexString }
        const payloadObj = decodePayload<{ data: string }>(entity.payload)
        const hexData = payloadObj.data

        let bytes: Uint8Array

        if (isEncrypted) {
          if (!encryption) {
            throw new Error(
              'File was uploaded encrypted. Provide `encryption.phrase` and `encryption.secret`.',
            )
          }
          const salt = attrStr(attributes, 'cdn_salt')
          const iv = attrStr(attributes, 'cdn_iv')
          if (!salt || !iv) {
            throw new Error(`Chunk ${uuid} is missing encryption metadata (salt/iv).`)
          }
          const encData: EncryptedData = { data: hexData, salt, iv }
          bytes = await decrypt(encData, encryption.phrase, encryption.secret)
        }
        else {
          bytes = hexToBytes(hexData)
        }

        return { chunk, total: total2, uuid, entity: entityId, bytes }
      }),
    )

    // 4 ─ Assemble (sorts by part internally)
    const assembled = assemble(chunks)

    // 5 ─ Decompress if the file was gzip-compressed before upload
    const data = manifest.compressed ? await decompress(assembled) : assembled

    return {
      data,
      filename: manifest.filename,
      mimeType: manifest.mimeType,
      size: manifest.size,
      manifest,
    }
  }
}
