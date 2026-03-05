/**
 * FileService – high-level CDN file operations.
 *
 * Handles automatic chunking (up to 64 KB per chunk), multi-wallet parallel
 * upload, optional AES-256-CBC encryption, and seamless reassembly on download.
 *
 * Access via `cdn.file`:
 *
 * ```ts
 * // Upload
 * const { manifestKey } = await cdn.file.upload(file, {
 *   encryption: { phrase: 'shared', secret: 'private' },
 *   onProgress: p => console.log(`${(p.ratio * 100).toFixed(1)}%`),
 * })
 *
 * // Download
 * const { data, filename, mimeType } = await cdn.file.download(manifestKey, {
 *   encryption: { phrase: 'shared', secret: 'private' },
 * })
 *
 * // Inspect manifest without downloading data
 * const manifest = await cdn.file.manifest(manifestKey)
 * ```
 */

import type {
  DownloadOptions,
  DownloadResult,
  FileManifest,
  UploadOptions,
  UploadResult,
} from '../types.js'
import type { Downloader } from '../download/downloader.js'
import type { Uploader } from '../upload/uploader.js'
import { ArkaCDNDownloadError, ArkaCDNUploadError } from '../errors.js'

export class FileService {
  constructor(
    private readonly uploader: Uploader,
    private readonly downloader: Downloader,
  ) { }

  /**
   * Uploads a file to the Arkiv network.
   *
   * The file is automatically split into ≤15 KB chunks, optionally encrypted,
   * and distributed across all configured wallet clients in parallel to maximise
   * throughput while avoiding nonce conflicts.
   *
   * A single {@link FileManifest} entity is stored after all chunks are
   * confirmed, giving you one `manifestKey` to share or save.
   *
   * @param input    `File` or `Blob` (browser) / `Uint8Array` or `ArrayBuffer` (Node)
   * @param options  Upload options (encryption, progress callback, etc.)
   * @returns        {@link UploadResult} containing the `manifestKey`
   *
   * @example
   * ```ts
   * // Browser – File input
   * const [file] = fileInput.files!
   * const { manifestKey } = await cdn.file.upload(file)
   *
   * // Node.js – Buffer
   * import { readFileSync } from 'fs'
   * const buf = readFileSync('image.png')
   * const { manifestKey } = await cdn.file.upload(buf, {
   *   filename: 'image.png',
   *   mimeType: 'image/png',
   * })
   *
   * // With encryption
   * const { manifestKey } = await cdn.file.upload(data, {
   *   encryption: { phrase: 'shared-phrase', secret: 'private-key' },
   * })
   * ```
   */
  async upload(
    input: File | Blob | Uint8Array | ArrayBuffer,
    options?: UploadOptions,
  ): Promise<UploadResult> {
    try {
      return await this.uploader.upload(input, options)
    } catch (err) {
      if (err instanceof ArkaCDNUploadError) throw err
      throw new ArkaCDNUploadError(
        err instanceof Error ? err.message : 'Upload failed',
        { cause: err },
      )
    }
  }

  /**
   * Downloads and reassembles a file from the Arkiv network.
   *
   * Fetches the manifest entity, then all chunk entities in parallel, then
   * decrypts (if needed) and assembles the original binary.
   *
   * @param manifestKey  On-chain key returned by {@link FileService.upload}
   * @param options      Decryption credentials and optional progress callback
   *
   * @example
   * ```ts
   * const { data, filename, mimeType } = await cdn.file.download(manifestKey)
   *
   * // With decryption
   * const { data } = await cdn.file.download(manifestKey, {
   *   encryption: { phrase: 'shared-phrase', secret: 'private-key' },
   * })
   *
   * // In browser – trigger a file download
   * const blob = new Blob([data], { type: mimeType })
   * const url = URL.createObjectURL(blob)
   * Object.assign(document.createElement('a'), { href: url, download: filename }).click()
   * ```
   */
  async download(manifestKey: string, options?: DownloadOptions): Promise<DownloadResult> {
    try {
      return await this.downloader.download(manifestKey, options)
    } catch (err) {
      if (err instanceof ArkaCDNDownloadError) throw err
      throw new ArkaCDNDownloadError(
        err instanceof Error ? err.message : 'Download failed',
        { cause: err, manifestKey },
      )
    }
  }

  /**
   * Fetches the {@link FileManifest} without downloading chunk data.
   * Useful for inspecting file metadata (name, MIME type, size, chunk count)
   * before committing to a full download.
   */
  async manifest(manifestKey: string): Promise<FileManifest> {
    try {
      return await this.downloader.fetchManifest(manifestKey)
    } catch (err) {
      if (err instanceof ArkaCDNDownloadError) throw err
      throw new ArkaCDNDownloadError(
        err instanceof Error ? err.message : 'Failed to fetch manifest',
        { cause: err, manifestKey },
      )
    }
  }
}
