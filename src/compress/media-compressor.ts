/**
 * FFmpeg-based media compression and resizing for Node.js / server-side environments.
 *
 * Automatically picks the right strategy by MIME type:
 *  - **JPEG / PNG / WebP** — resize + quality resampling
 *  - **GIF**               — resize, reduce fps, optimise palette
 *  - **Video (mp4, webm…)** — resize, lower bitrate / fps
 *
 * Operations use temporary files so arbitrarily large media can be processed
 * without holding everything in memory at once.  Temp files are always cleaned
 * up — even on error.
 *
 * ### Requirements (Node.js only)
 * ```bash
 * npm install fluent-ffmpeg ffmpeg-static
 * npm install -D @types/fluent-ffmpeg
 * ```
 *
 * The class degrades gracefully in browser environments: `isAvailable()` returns
 * `false` and `compress()` returns the original data unchanged.
 *
 * @example
 * ```ts
 * import { MediaCompressor } from 'arka-cdn'
 *
 * // Resize a JPEG to 800 px wide (keeps aspect ratio) at 75 % quality
 * const optimised = await MediaCompressor.compress(jpegBytes, 'image/jpeg', {
 *   image: { width: 800, quality: 75 },
 * })
 *
 * // Optimise a GIF: half-speed palette + resize
 * const smallGif = await MediaCompressor.compress(gifBytes, 'image/gif', {
 *   gif: { width: 480, fps: 10, colors: 64 },
 * })
 *
 * // Compress a video for web delivery
 * const webVideo = await MediaCompressor.compress(mp4Bytes, 'video/mp4', {
 *   video: { width: 1280, videoBitrate: '800k', audioBitrate: '96k' },
 * })
 * ```
 */

// ── Option interfaces ─────────────────────────────────────────────────────────

/** Options for JPEG / PNG / WebP image optimisation. */
export interface ImageOptimizeOptions {
  /** Target width in pixels.  Aspect ratio is preserved unless both are given. */
  width?: number
  /** Target height in pixels. Aspect ratio is preserved unless both are given. */
  height?: number
  /**
   * Output quality 1–100 (default **80**).
   * Applies to JPEG and WebP.  PNG is lossless — use width/height to reduce size.
   */
  quality?: number
  /** Force a specific output format (default: same as input MIME type). */
  format?: 'jpeg' | 'webp' | 'png'
}

/** Options for GIF optimisation. */
export interface GifOptimizeOptions {
  /** Target width in pixels (preserves aspect ratio). */
  width?: number
  /** Target height in pixels (preserves aspect ratio). */
  height?: number
  /**
   * Maximum frames per second (default **15**).
   * Lower values (e.g. 10) significantly reduce file size.
   */
  fps?: number
  /**
   * Maximum palette colours 2–256 (default **128**).
   * Fewer colours → smaller file but lower quality.
   */
  colors?: number
}

/** Options for video compression. */
export interface VideoOptimizeOptions {
  /** Target width in pixels.  Aspect ratio is preserved unless both are given. */
  width?: number
  /** Target height in pixels. Aspect ratio is preserved unless both are given. */
  height?: number
  /**
   * Video bitrate, e.g. `'800k'`, `'2M'` (default **`'1000k'`**).
   * Lower values produce smaller files with more visible compression artefacts.
   */
  videoBitrate?: string
  /**
   * Audio bitrate, e.g. `'128k'` (default **`'128k'`**).
   * Omit if the source has no audio track.
   */
  audioBitrate?: string
  /**
   * Maximum frame rate (default: keep original).
   * Reducing to 24 or 30 cuts file size noticeably for screen-recordings.
   */
  fps?: number
}

/**
 * Media compression options passed to `MediaCompressor.compress()` or to the
 * `compress` upload option when uploading media files.
 */
export interface MediaCompressOptions {
  /** Image optimisation options (JPEG, PNG, WebP). */
  image?: ImageOptimizeOptions
  /** GIF optimisation options. */
  gif?: GifOptimizeOptions
  /** Video compression options. */
  video?: VideoOptimizeOptions
}

// ── MIME type helpers ─────────────────────────────────────────────────────────

const RASTER_IMAGES = ['image/jpeg', 'image/png', 'image/webp'] as const
const GIF_MIME = 'image/gif'
const VIDEO_PREFIX = 'video/'

/** Returns true if the MIME type can be processed by {@link MediaCompressor}. */
export function isMediaCompressible(mimeType: string): boolean {
  const m = mimeType.toLowerCase().split(';')[0]!.trim()
  return (
    (RASTER_IMAGES as readonly string[]).includes(m)
    || m === GIF_MIME
    || m.startsWith(VIDEO_PREFIX)
  )
}

// ── Environment detection ────────────────────────────────────────────────────

function isNodeJs(): boolean {
  return typeof process !== 'undefined'
    && typeof process.versions?.node === 'string'
    && typeof globalThis.window === 'undefined'
}

// ── Temporary file helpers ───────────────────────────────────────────────────

async function writeTempFile(data: Uint8Array, ext: string): Promise<string> {
  const { tmpdir } = await import('node:os')
  const { writeFile, mkdtemp } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const dir = await mkdtemp(join(tmpdir(), 'arka-cdn-'))
  const path = join(dir, `input.${ext}`)
  await writeFile(path, data)
  return path
}

async function readTempFile(path: string): Promise<Uint8Array> {
  const { readFile } = await import('node:fs/promises')
  const buf = await readFile(path)
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
}

async function removeTempFile(path: string): Promise<void> {
  const { rm } = await import('node:fs/promises')
  const { dirname } = await import('node:path')
  await rm(dirname(path), { recursive: true, force: true }).catch(() => {/* ignore */ })
}

/** Derive a file extension from a MIME type. */
function extFromMime(mimeType: string, override?: string): string {
  if (override) return override
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'video/x-msvideo': 'avi',
    'video/x-matroska': 'mkv',
  }
  return map[mimeType.toLowerCase().split(';')[0]!.trim()] ?? 'bin'
}

// ── FFmpeg runner ────────────────────────────────────────────────────────────

type FfmpegCommand = ReturnType<typeof import('fluent-ffmpeg')>

function runFfmpeg(cmd: FfmpegCommand, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    cmd
      .output(outputPath)
      .on('end', (_stdout: string | null, _stderr: string | null) => resolve())
      .on('error', (err: Error) => reject(new Error(`FFmpeg error: ${err.message}`)))
      .run()
  })
}

async function loadFfmpeg() {
  const ffmpeg = await import('fluent-ffmpeg')
  const mod = (ffmpeg as any).default ?? ffmpeg

  // Try to auto-locate ffmpeg binary via ffmpeg-static
  try {
    const ffmpegStatic = await import('ffmpeg-static')
    const bin = (ffmpegStatic as any).default ?? ffmpegStatic
    if (typeof bin === 'string' && bin.length > 0) mod.setFfmpegPath(bin)
  }
  catch { /* ffmpeg-static not installed — rely on system PATH */ }

  return mod as typeof import('fluent-ffmpeg')
}

// ── Per-type compressors ──────────────────────────────────────────────────────

async function compressImage(
  inputPath: string,
  outputPath: string,
  mime: string,
  opts: ImageOptimizeOptions,
  ffmpeg: typeof import('fluent-ffmpeg'),
): Promise<void> {
  const quality = opts.quality ?? 80
  const cmd = ffmpeg(inputPath) as FfmpegCommand

  // Scale filter
  if (opts.width || opts.height) {
    const w = opts.width ?? -1
    const h = opts.height ?? -1
    // Keep aspect ratio: if one dim is -1, FFmpeg auto-calculates
    cmd.videoFilter(`scale=${w}:${h}`)
  }

  // Quality per codec
  const fmt = opts.format ?? (mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'mjpeg')
  if (fmt === 'mjpeg') {
    // q:v 1 (best) – 31 (worst), map quality 1–100 → 2–31 inversely
    const qv = Math.max(2, Math.round(2 + (100 - quality) * 29 / 99))
    cmd.outputOptions(['-vframes', '1', '-q:v', String(qv)])
  }
  else if (fmt === 'webp') {
    cmd.outputOptions(['-vframes', '1', `-quality`, String(quality)])
  }
  else {
    cmd.outputOptions(['-vframes', '1'])
  }

  cmd.format(fmt === 'mjpeg' ? 'image2' : fmt)
  await runFfmpeg(cmd, outputPath)
}

async function compressGif(
  inputPath: string,
  outputPath: string,
  opts: GifOptimizeOptions,
  ffmpeg: typeof import('fluent-ffmpeg'),
): Promise<void> {
  const fps = opts.fps ?? 15
  const colors = Math.min(256, Math.max(2, opts.colors ?? 128))
  const scaleW = opts.width ?? -1
  const scaleH = opts.height ?? -1

  const scaleFilter = (opts.width || opts.height)
    ? `scale=${scaleW}:${scaleH}:flags=lanczos,`
    : ''

  // Two-pass palette optimisation — produces much smaller GIFs than naive encoding
  const palettePath = outputPath.replace('.gif', '-palette.png')
  const palettegenFilter = `${scaleFilter}fps=${fps},split[s0][s1];[s0]palettegen=max_colors=${colors}[p];[s1][p]paletteuse=dither=bayer`

  const cmd = ffmpeg(inputPath) as FfmpegCommand
  cmd.complexFilter(palettegenFilter).format('gif')
  await runFfmpeg(cmd, outputPath)

  // Clean up any palette artefact if it ended up on disk
  await removeTempFile(palettePath).catch(() => {/* noop */ })
}

async function compressVideo(
  inputPath: string,
  outputPath: string,
  opts: VideoOptimizeOptions,
  ffmpeg: typeof import('fluent-ffmpeg'),
): Promise<void> {
  const cmd = ffmpeg(inputPath) as FfmpegCommand

  if (opts.width || opts.height) {
    const w = opts.width ?? -2
    const h = opts.height ?? -2
    cmd.videoFilter(`scale=${w}:${h}`)
  }

  if (opts.fps) cmd.fps(opts.fps)
  if (opts.videoBitrate) cmd.videoBitrate(opts.videoBitrate)
  else cmd.videoBitrate('1000k')

  if (opts.audioBitrate) cmd.audioBitrate(opts.audioBitrate)
  else cmd.audioBitrate('128k')

  // H.264 + AAC for maximum compatibility
  cmd.videoCodec('libx264').audioCodec('aac').outputOptions(['-movflags', '+faststart'])

  await runFfmpeg(cmd, outputPath)
}

// ── Public API ────────────────────────────────────────────────────────────────

let _ffmpegAvailable: boolean | null = null

/**
 * FFmpeg-powered media compressor for Node.js / server environments.
 *
 * Works with JPEG, PNG, WebP, GIF, and any video format FFmpeg supports.
 * Uses temporary files for I/O so memory pressure stays low for large files.
 */
export class MediaCompressor {
  /**
   * Returns `true` when running in Node.js **and** `fluent-ffmpeg` can be loaded.
   * Always returns `false` in browser environments.
   */
  static async isAvailable(): Promise<boolean> {
    if (!isNodeJs()) return false
    if (_ffmpegAvailable !== null) return _ffmpegAvailable
    try {
      await loadFfmpeg()
      _ffmpegAvailable = true
    }
    catch {
      _ffmpegAvailable = false
    }
    return _ffmpegAvailable
  }

  /**
   * Returns `true` if the given MIME type can be processed by this compressor.
   *
   * @example
   * ```ts
   * MediaCompressor.supports('image/gif')   // true
   * MediaCompressor.supports('video/mp4')   // true
   * MediaCompressor.supports('text/plain')  // false
   * ```
   */
  static supports(mimeType: string): boolean {
    return isMediaCompressible(mimeType)
  }

  /**
   * Compress / optimise a media file using FFmpeg.
   *
   * Falls back to returning the original data if:
   *  - Not running in Node.js
   *  - `fluent-ffmpeg` / `ffmpeg-static` are not installed
   *  - The MIME type is not a supported media format
   *
   * @param data     Raw file bytes.
   * @param mimeType MIME type of the input (e.g. `'image/jpeg'`, `'video/mp4'`).
   * @param options  Per-type compression options.
   */
  static async compress(
    data: Uint8Array,
    mimeType: string,
    options: MediaCompressOptions = {},
  ): Promise<Uint8Array> {
    const mime = mimeType.toLowerCase().split(';')[0]!.trim()

    if (!(await MediaCompressor.isAvailable()) || !isMediaCompressible(mime)) {
      return data
    }

    const ffmpeg = await loadFfmpeg()

    const isGif = mime === GIF_MIME
    const isImage = (RASTER_IMAGES as readonly string[]).includes(mime)
    const isVideo = mime.startsWith(VIDEO_PREFIX)

    const outputFmt = isImage
      ? (options.image?.format ?? extFromMime(mime))
      : isGif
        ? 'gif'
        : extFromMime(mime)

    const inputExt = extFromMime(mime)
    const outputExt = isImage && options.image?.format
      ? options.image.format === 'jpeg' ? 'jpg' : options.image.format
      : isGif ? 'gif' : extFromMime(mime)

    const inputPath = await writeTempFile(data, inputExt)
    // Output goes in a sibling file inside the same temp dir
    const { join, dirname } = await import('node:path')
    const outputPath = join(dirname(inputPath), `output.${outputExt}`)

    try {
      if (isImage) {
        await compressImage(inputPath, outputPath, mime, options.image ?? {}, ffmpeg)
      }
      else if (isGif) {
        await compressGif(inputPath, outputPath, options.gif ?? {}, ffmpeg)
      }
      else if (isVideo) {
        await compressVideo(inputPath, outputPath, options.video ?? {}, ffmpeg)
      }

      const result = await readTempFile(outputPath)
      // Return original if FFmpeg made the file larger
      return result.byteLength < data.byteLength ? result : data
    }
    finally {
      await removeTempFile(inputPath)
    }
  }
}
