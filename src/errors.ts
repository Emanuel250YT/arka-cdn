/**
 * ArkaCDN error hierarchy.
 *
 * All errors thrown by ArkaCDN extend {@link ArkaCDNError}, so a single
 * `catch (e) { if (e instanceof ArkaCDNError) ... }` is enough to handle
 * every library-level failure.
 *
 * More specific sub-classes let you distinguish between upload, download and
 * entity-level failures:
 *
 * ```ts
 * import { ArkaCDNError, ArkaCDNUploadError, ArkaCDNDownloadError, ArkaCDNEntityError } from 'arka-cdn'
 *
 * try {
 *   const { manifestKey } = await cdn.file.upload(file)
 * } catch (err) {
 *   if (err instanceof ArkaCDNUploadError) {
 *     console.error('Upload failed:', err.message, err.cause)
 *   } else if (err instanceof ArkaCDNError) {
 *     console.error('ArkaCDN error:', err.message)
 *   } else {
 *     throw err // unexpected – re-throw
 *   }
 * }
 * ```
 */

// ── Base ─────────────────────────────────────────────────────────────────────

/**
 * Base class for all errors thrown by ArkaCDN.
 * Extends the native `Error` with an optional structured `cause`.
 */
export class ArkaCDNError extends Error {
  override readonly name: string = 'ArkaCDNError'

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    // Restore prototype chain (required when extending built-ins in TS / ES5 targets)
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

// ── Sub-classes ───────────────────────────────────────────────────────────────

/**
 * Thrown when a file upload fails.
 * The `cause` field is the underlying SDK or network error.
 *
 * @example
 * ```ts
 * import { ArkaCDNUploadError } from 'arka-cdn'
 *
 * try {
 *   await cdn.file.upload(data)
 * } catch (err) {
 *   if (err instanceof ArkaCDNUploadError) {
 *     console.error('Part', err.chunkIndex, 'failed:', err.message)
 *   }
 * }
 * ```
 */
export class ArkaCDNUploadError extends ArkaCDNError {
  override readonly name: string = 'ArkaCDNUploadError'

  /**
   * Zero-based index of the chunk that failed, or `undefined` if the failure
   * occurred outside chunk processing (e.g. manifest upload).
   */
  readonly chunkIndex?: number

  constructor(message: string, options?: { cause?: unknown; chunkIndex?: number }) {
    super(message, { cause: options?.cause })
    if (options?.chunkIndex !== undefined) this.chunkIndex = options.chunkIndex
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/**
 * Thrown when a file download or manifest fetch fails.
 *
 * @example
 * ```ts
 * import { ArkaCDNDownloadError } from 'arka-cdn'
 *
 * try {
 *   const result = await cdn.file.download(manifestKey)
 * } catch (err) {
 *   if (err instanceof ArkaCDNDownloadError) {
 *     console.error('Download failed for', err.manifestKey, err.message)
 *   }
 * }
 * ```
 */
export class ArkaCDNDownloadError extends ArkaCDNError {
  override readonly name: string = 'ArkaCDNDownloadError'

  /** The manifest key that was being fetched when the error occurred. */
  readonly manifestKey?: string

  constructor(message: string, options?: { cause?: unknown; manifestKey?: string }) {
    super(message, { cause: options?.cause })
    if (options?.manifestKey !== undefined) this.manifestKey = options.manifestKey
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/**
 * Thrown when an entity operation (create / update / delete / extend / query / watch)
 * fails at the SDK or network level.
 *
 * @example
 * ```ts
 * import { ArkaCDNEntityError } from 'arka-cdn'
 *
 * try {
 *   await cdn.entity.create({ ... })
 * } catch (err) {
 *   if (err instanceof ArkaCDNEntityError) {
 *     console.error('Entity op failed:', err.operation, err.message)
 *   }
 * }
 * ```
 */
export class ArkaCDNEntityError extends ArkaCDNError {
  override readonly name: string = 'ArkaCDNEntityError'

  /**
   * The entity operation that failed (e.g. `'create'`, `'update'`, `'delete'`,
   * `'extend'`, `'batch'`, `'get'`, `'query'`, `'watch'`).
   */
  readonly operation?: string

  constructor(message: string, options?: { cause?: unknown; operation?: string }) {
    super(message, { cause: options?.cause })
    if (options?.operation !== undefined) this.operation = options.operation
    Object.setPrototypeOf(this, new.target.prototype)
  }
}
