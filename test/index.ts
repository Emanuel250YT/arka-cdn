/**
 * Integration tests for ArkaCDN – import from the package itself.
 *
 * These tests exercise the public API surface of `arka-cdn` exactly as an
 * end-user would, using module imports that resolve to the built output (or
 * the vitest alias that points to `src/index.ts` during development).
 */

import { describe, it, expect } from 'vitest'

// ── Import everything from the package root ───────────────────────────────────
import {
  // Main client
  ArkaCDN,
  ArkivCDN,
  createArkaCDN,
  // Services
  EntityService,
  FileService,
  // Errors
  ArkaCDNError,
  ArkaCDNUploadError,
  ArkaCDNDownloadError,
  ArkaCDNEntityError,
  // Chunker
  DEFAULT_CHUNK_SIZE,
  split,
  assemble,
  // Crypto
  encrypt,
  decrypt,
  // Utils
  generateUUID,
  WalletPool,
  Uploader,
  Downloader,
} from 'arka-cdn'

// ────────────────────────────────────────────────────────────────────────────
// Exports surface
// ────────────────────────────────────────────────────────────────────────────

describe('package exports', () => {
  it('exports ArkaCDN class', () => {
    expect(typeof ArkaCDN).toBe('function')
    expect(typeof ArkaCDN.create).toBe('function')
  })

  it('exports ArkivCDN as backward-compat alias', () => {
    expect(ArkivCDN).toBe(ArkaCDN)
  })

  it('exports createArkaCDN factory', () => {
    expect(typeof createArkaCDN).toBe('function')
  })

  it('exports EntityService class', () => {
    expect(typeof EntityService).toBe('function')
  })

  it('exports FileService class', () => {
    expect(typeof FileService).toBe('function')
  })

  it('exports WalletPool class', () => {
    expect(typeof WalletPool).toBe('function')
  })

  it('exports Uploader class', () => {
    expect(typeof Uploader).toBe('function')
  })

  it('exports Downloader class', () => {
    expect(typeof Downloader).toBe('function')
  })

  it('exports chunker utilities', () => {
    expect(typeof split).toBe('function')
    expect(typeof assemble).toBe('function')
  })

  it('exports crypto utilities', () => {
    expect(typeof encrypt).toBe('function')
    expect(typeof decrypt).toBe('function')
  })

  it('exports generateUUID', () => {
    expect(typeof generateUUID).toBe('function')
  })
})

// ────────────────────────────────────────────────────────────────────────────
// DEFAULT_CHUNK_SIZE
// ────────────────────────────────────────────────────────────────────────────

describe('DEFAULT_CHUNK_SIZE', () => {
  it('is 64 KB (65 536 bytes)', () => {
    expect(DEFAULT_CHUNK_SIZE).toBe(64 * 1024)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// Error hierarchy
// ────────────────────────────────────────────────────────────────────────────

describe('error classes', () => {
  it('ArkaCDNError extends Error', () => {
    const err = new ArkaCDNError('base error')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(ArkaCDNError)
    expect(err.name).toBe('ArkaCDNError')
    expect(err.message).toBe('base error')
  })

  it('ArkaCDNUploadError extends ArkaCDNError', () => {
    const cause = new Error('network timeout')
    const err = new ArkaCDNUploadError('chunk 3 failed', { cause, chunkIndex: 3 })
    expect(err).toBeInstanceOf(ArkaCDNError)
    expect(err).toBeInstanceOf(ArkaCDNUploadError)
    expect(err.name).toBe('ArkaCDNUploadError')
    expect(err.chunkIndex).toBe(3)
    expect(err.cause).toBe(cause)
  })

  it('ArkaCDNDownloadError extends ArkaCDNError', () => {
    const err = new ArkaCDNDownloadError('manifest not found', { manifestKey: '0xabc' })
    expect(err).toBeInstanceOf(ArkaCDNError)
    expect(err).toBeInstanceOf(ArkaCDNDownloadError)
    expect(err.name).toBe('ArkaCDNDownloadError')
    expect(err.manifestKey).toBe('0xabc')
  })

  it('ArkaCDNEntityError extends ArkaCDNError', () => {
    const err = new ArkaCDNEntityError('tx reverted', { operation: 'create' })
    expect(err).toBeInstanceOf(ArkaCDNError)
    expect(err).toBeInstanceOf(ArkaCDNEntityError)
    expect(err.name).toBe('ArkaCDNEntityError')
    expect(err.operation).toBe('create')
  })

  it('instanceof checks work across sub-classes', () => {
    const upload = new ArkaCDNUploadError('msg')
    const download = new ArkaCDNDownloadError('msg')
    const entity = new ArkaCDNEntityError('msg')

    // All are ArkaCDNError
    expect(upload).toBeInstanceOf(ArkaCDNError)
    expect(download).toBeInstanceOf(ArkaCDNError)
    expect(entity).toBeInstanceOf(ArkaCDNError)

    // None are each other's sub-class
    expect(upload).not.toBeInstanceOf(ArkaCDNDownloadError)
    expect(download).not.toBeInstanceOf(ArkaCDNUploadError)
    expect(entity).not.toBeInstanceOf(ArkaCDNUploadError)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// Chunker
// ────────────────────────────────────────────────────────────────────────────

describe('chunker (via package export)', () => {
  it('splits a 128 KB buffer into 2 chunks at default 64 KB size', () => {
    const data = new Uint8Array(128 * 1024).fill(1)
    const chunks = split(data, generateUUID())
    expect(chunks).toHaveLength(2)
  })

  it('reassembles back to original', () => {
    // Fill without crypto.getRandomValues (Node.js limits it to 65 536 bytes)
    const original = new Uint8Array(200 * 1024)
    for (let i = 0; i < original.length; i++) original[i] = i & 0xff
    const chunks = split(original, generateUUID())
    const rebuilt = assemble(chunks)
    expect(rebuilt).toEqual(original)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// WalletPool.fromClients
// ────────────────────────────────────────────────────────────────────────────

describe('WalletPool.fromClients', () => {
  const makeMock = (address: string) => ({
    account: { address },
    createEntity: async () => ({ entityKey: '0x1', txHash: '0x2' }),
    mutateEntities: async (p: { creates?: unknown[] }) => ({
      txHash: '0x3',
      createdEntities: Array.from({ length: p.creates?.length ?? 0 }, (_, i) => `0x${i}`),
    }),
  })

  it('creates a pool synchronously from pre-built clients', () => {
    const pool = WalletPool.fromClients([makeMock('0xAA'), makeMock('0xBB')] as never)
    expect(pool.size).toBe(2)
  })

  it('accepts a single client (not wrapped in array)', () => {
    const pool = WalletPool.fromClients(makeMock('0xCC') as never)
    expect(pool.size).toBe(1)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// Crypto
// ────────────────────────────────────────────────────────────────────────────

describe('crypto (via package export)', () => {
  it('encrypts and decrypts data round-trip', async () => {
    const data = new TextEncoder().encode('arka-cdn integration test')
    const enc = await encrypt(data, 'phrase', 'secret')
    const dec = await decrypt(enc, 'phrase', 'secret')
    expect(new TextDecoder().decode(dec)).toBe('arka-cdn integration test')
  })
})
