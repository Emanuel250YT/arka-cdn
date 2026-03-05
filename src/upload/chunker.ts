/**
 * Splits a binary blob into sequential chunks of at most `maxBytes` each.
 *
 * The default chunk size is 64 KB (65 536 bytes), reflecting the current
 * Arkiv network payload limit. Reduce `maxChunkSize` in {@link ArkaCDNConfig}
 * if you need extra head-room for attribute overhead.
 */

import type { Chunk } from '../types.js'
import { generateUUID } from '../utils/uuid.js'

/** Default chunk size: 64 KB — matches the current Arkiv network payload limit. */
export const DEFAULT_CHUNK_SIZE = 64 * 1024 // 64 KB

/**
 * Splits `data` into an ordered array of {@link Chunk} objects.
 *
 * @param data      Raw bytes of the file to split
 * @param entityId  Parent file UUID (shared by all chunks)
 * @param maxBytes  Max bytes per chunk (default: {@link DEFAULT_CHUNK_SIZE})
 */
export function split(
  data: Uint8Array,
  entityId: string,
  maxBytes: number = DEFAULT_CHUNK_SIZE,
): Chunk[] {
  if (maxBytes <= 0 || !Number.isInteger(maxBytes))
    throw new RangeError(`maxBytes must be a positive integer, got ${maxBytes}`)

  const totalChunks = Math.ceil(data.length / maxBytes)
  if (totalChunks === 0) return []

  const chunks: Chunk[] = []

  for (let part = 0; part < totalChunks; part++) {
    const start = part * maxBytes
    const end = Math.min(start + maxBytes, data.length)

    chunks.push({
      chunk: part,
      total: totalChunks,
      uuid: generateUUID(),
      entity: entityId,
      bytes: data.slice(start, end),
    })
  }

  return chunks
}

/**
 * Reassembles chunks into the original binary data.
 * Chunks MUST be sorted by `part` before calling this function.
 */
export function assemble(chunks: Chunk[]): Uint8Array {
  const sorted = [...chunks].sort((a, b) => a.chunk - b.chunk)
  const totalSize = sorted.reduce((sum, c) => sum + c.bytes.length, 0)
  const output = new Uint8Array(totalSize)

  let offset = 0
  for (const chunk of sorted) {
    output.set(chunk.bytes, offset)
    offset += chunk.bytes.length
  }

  return output
}

/**
 * Converts a {@link File} or {@link Blob} (browser) into a `Uint8Array`.
 * Also works with `Buffer` / `Uint8Array` directly (Node.js).
 */
export async function toUint8Array(
  input: File | Blob | Uint8Array | ArrayBuffer,
): Promise<Uint8Array> {
  if (input instanceof Uint8Array) return input
  if (input instanceof ArrayBuffer) return new Uint8Array(input)
  // File / Blob (browser & Node.js 20+)
  const buffer = await input.arrayBuffer()
  return new Uint8Array(buffer)
}
