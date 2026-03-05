/**
 * Isomorphic gzip compression / decompression.
 *
 * Automatically picks the best available API:
 *  - **Browser / modern Node.js 18+**: built-in `CompressionStream` / `DecompressionStream`
 *  - **Legacy Node.js**: `node:zlib` via dynamic import
 *
 * ### When to compress
 * Video, audio, JPEG, PNG, WebP, ZIP and PDF files are already highly
 * compressed.  Applying gzip on top increases file size.  Use `isCompressible`
 * to skip those formats, or pass `compress: 'auto'` to the uploader and let
 * ArkaCDN decide based on the MIME type.
 *
 * @example  Node.js
 * ```ts
 * import { compress, decompress, isCompressible } from 'arka-cdn'
 *
 * const raw = new TextEncoder().encode(JSON.stringify(bigObject))
 * if (isCompressible('application/json')) {
 *   const small = await compress(raw)   // typically 60–80 % smaller
 *   const back  = await decompress(small)
 * }
 * ```
 */

// ── Formats that are already compressed (binary-level) ───────────────────────

/**
 * MIME type prefixes / exact types whose content is already compressed.
 * Gzip-ing these would make the data **larger**, not smaller.
 */
const ALREADY_COMPRESSED: readonly string[] = [
  'video/',            // mp4, webm, mkv, mov, avi …
  'audio/',            // mp3, aac, flac, ogg …
  'image/jpeg',        // JPEG (DCT compression)
  'image/png',         // PNG (deflate compression)
  'image/gif',         // GIF (LZW compression)
  'image/webp',        // WebP
  'image/avif',        // AVIF
  'image/heic',        // HEIC/HEIF
  'application/zip',
  'application/gzip',
  'application/x-gzip',
  'application/x-bzip',
  'application/x-bzip2',
  'application/x-rar-compressed',
  'application/x-7z-compressed',
  'application/zstd',
  'application/pdf',   // PDF is often already deflated internally
  'application/wasm',  // Wasm binaries compress poorly with gzip
]

/**
 * Returns `true` if gzip compression is likely to **reduce** the size of
 * a file with the given `mimeType`.
 *
 * Plain text, JSON, XML, CSV and raw binary data are all good candidates.
 * Pre-compressed media formats (video, audio, JPEG …) are not.
 *
 * @example
 * ```ts
 * isCompressible('application/json')  // true
 * isCompressible('text/html')         // true
 * isCompressible('video/mp4')         // false
 * isCompressible('image/jpeg')        // false
 * ```
 */
export function isCompressible(mimeType: string): boolean {
  const lower = mimeType.toLowerCase().split(';')[0]!.trim()
  return !ALREADY_COMPRESSED.some(prefix => lower.startsWith(prefix))
}

// ── Merge helper (shared between both paths) ──────────────────────────────────

function mergeBuffers(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((s, c) => s + c.byteLength, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

// ── Web Streams path (browser + Node.js 18+) ──────────────────────────────────

async function streamTransform(
  data: Uint8Array,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const writer = stream.writable.getWriter()
  // Write input and close to flush
  await writer.write(data as unknown as ArrayBuffer)
  await writer.close()

  const out: Uint8Array[] = []
  const reader = stream.readable.getReader()
  for (; ;) {
    const { done, value } = await reader.read()
    if (done) break
    out.push(value)
  }
  return mergeBuffers(out)
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Compresses `data` with **gzip**.
 *
 * Uses `CompressionStream` in browsers / Node.js 18+, falls back to
 * `node:zlib` on older Node builds.
 *
 * @example
 * ```ts
 * const compressed = await compress(new TextEncoder().encode('hello world'))
 * ```
 */
export async function compress(data: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream !== 'undefined') {
    return streamTransform(data, new CompressionStream('gzip'))
  }
  // Node.js < 18 fallback
  const { gzip } = await import('node:zlib')
  const { promisify } = await import('node:util')
  const buf = await (promisify(gzip) as (input: Uint8Array) => Promise<Buffer>)(data)
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
}

/**
 * Decompresses a **gzip**-compressed buffer.
 *
 * Uses `DecompressionStream` in browsers / Node.js 18+, falls back to
 * `node:zlib` on older Node builds.
 *
 * @example
 * ```ts
 * const original = await decompress(compressedBytes)
 * ```
 */
export async function decompress(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream !== 'undefined') {
    return streamTransform(data, new DecompressionStream('gzip'))
  }
  // Node.js < 18 fallback
  const { gunzip } = await import('node:zlib')
  const { promisify } = await import('node:util')
  const buf = await (promisify(gunzip) as (input: Uint8Array) => Promise<Buffer>)(data)
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
}
