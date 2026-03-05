import { describe, expect, it } from 'vitest'
import { assemble, DEFAULT_CHUNK_SIZE, split } from '../src/upload/chunker.js'
import { generateUUID } from '../src/utils/uuid.js'
import { decrypt, encrypt } from '../src/crypto/aes.js'

// ────────────────────────────────────────────────────────────────────────────
// Chunker
// ────────────────────────────────────────────────────────────────────────────

describe('chunker', () => {
  it('splits a buffer smaller than maxBytes into one chunk', () => {
    const data = new Uint8Array(100).fill(42)
    const entityId = generateUUID()
    const chunks = split(data, entityId, 200)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]!.part).toBe(0)
    expect(chunks[0]!.total).toBe(1)
    expect(chunks[0]!.entity).toBe(entityId)
    expect(chunks[0]!.bytes).toEqual(data)
  })

  it('splits a 32 KB buffer into two 16 KB chunks', () => {
    const maxBytes = 16 * 1024
    const data = new Uint8Array(32 * 1024).fill(7)
    const entityId = generateUUID()
    const chunks = split(data, entityId, maxBytes)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]!.part).toBe(0)
    expect(chunks[1]!.part).toBe(1)
    expect(chunks[0]!.bytes).toHaveLength(maxBytes)
    expect(chunks[1]!.bytes).toHaveLength(maxBytes)
    expect(chunks[0]!.uuid).not.toBe(chunks[1]!.uuid)
    expect(chunks[0]!.entity).toBe(chunks[1]!.entity)
  })

  it('handles odd-sized last chunk', () => {
    const maxBytes = 100
    const data = new Uint8Array(250).fill(1)
    const entityId = generateUUID()
    const chunks = split(data, entityId, maxBytes)
    expect(chunks).toHaveLength(3)
    expect(chunks[2]!.bytes).toHaveLength(50)
  })

  it('reassembles chunks into the original data', () => {
    const original = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(1000)))
    const entityId = generateUUID()
    const chunks = split(original, entityId, 300)
    const reassembled = assemble(chunks)
    expect(reassembled).toEqual(original)
  })

  it('reassembles chunks regardless of input order', () => {
    const original = new Uint8Array([1, 2, 3, 4, 5, 6])
    const entityId = generateUUID()
    const chunks = split(original, entityId, 2)
    // Shuffle chunks
    const shuffled = [chunks[2]!, chunks[0]!, chunks[1]!]
    const reassembled = assemble(shuffled)
    expect(reassembled).toEqual(original)
  })

  it('uses DEFAULT_CHUNK_SIZE when maxBytes is omitted', () => {
    const data = new Uint8Array(DEFAULT_CHUNK_SIZE + 1)
    const chunks = split(data, generateUUID())
    expect(chunks).toHaveLength(2)
  })

  it('throws for invalid maxBytes', () => {
    expect(() => split(new Uint8Array(10), generateUUID(), 0)).toThrow(RangeError)
    expect(() => split(new Uint8Array(10), generateUUID(), -1)).toThrow(RangeError)
    expect(() => split(new Uint8Array(10), generateUUID(), 1.5)).toThrow(RangeError)
  })

  it('returns an empty array for empty input', () => {
    const chunks = split(new Uint8Array(0), generateUUID(), 100)
    expect(chunks).toHaveLength(0)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// UUID
// ────────────────────────────────────────────────────────────────────────────

describe('generateUUID', () => {
  it('returns a valid UUID v4 string', () => {
    const uuid = generateUUID()
    expect(uuid).toMatch(
      /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i,
    )
  })

  it('generates unique UUIDs', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generateUUID()))
    expect(ids.size).toBe(1000)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// AES encryption
// ────────────────────────────────────────────────────────────────────────────

describe('AES encrypt / decrypt', () => {
  const PHRASE = 'test-phrase'
  const SECRET = 'test-secret'

  it('encrypts and decrypts arbitrary bytes', async () => {
    const original = new TextEncoder().encode('Hello, Arkiv CDN!')
    const enc = await encrypt(original, PHRASE, SECRET)

    expect(enc.data).toBeTruthy()
    expect(enc.salt).toHaveLength(32) // 16 bytes → 32 hex chars
    expect(enc.iv).toHaveLength(32)

    const decrypted = await decrypt(enc, PHRASE, SECRET)
    expect(new TextDecoder().decode(decrypted)).toBe('Hello, Arkiv CDN!')
  })

  it('produces different ciphertext each time (random salt + IV)', async () => {
    const data = new TextEncoder().encode('same data')
    const enc1 = await encrypt(data, PHRASE, SECRET)
    const enc2 = await encrypt(data, PHRASE, SECRET)
    expect(enc1.data).not.toBe(enc2.data)
    expect(enc1.salt).not.toBe(enc2.salt)
    expect(enc1.iv).not.toBe(enc2.iv)
  })

  it('fails to decrypt with wrong secret', async () => {
    const data = new TextEncoder().encode('secret message')
    const enc = await encrypt(data, PHRASE, SECRET)
    await expect(decrypt(enc, PHRASE, 'wrong-secret')).rejects.toThrow()
  })

  it('encrypts large payloads (15 KB chunk)', async () => {
    const data = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(15 * 1024)))
    const enc = await encrypt(data, PHRASE, SECRET)
    const decrypted = await decrypt(enc, PHRASE, SECRET)
    expect(decrypted).toEqual(data)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// WalletPool
// ────────────────────────────────────────────────────────────────────────────

describe('WalletPool', () => {
  // We use a mock wallet to keep tests free of network calls
  const makeMockWallet = (address: string) => ({
    account: { address },
    async createEntity(_: unknown) { return { entityKey: '0xabc', txHash: '0xdef' } },
    async mutateEntities(params: { creates?: unknown[] }) {
      const count = params.creates?.length ?? 0
      return {
        txHash: '0x123',
        createdEntities: Array.from({ length: count }, (_, i) => `0x${i.toString(16).padStart(64, '0')}`),
      }
    },
  })

  it('creates a pool with the provided factory', async () => {
    const { WalletPool } = await import('../src/upload/wallet-pool.js')
    const pool = await WalletPool.create(
      [{ privateKey: '0x01' }, { privateKey: '0x02' }],
      cfg => makeMockWallet(cfg.privateKey) as never,
    )
    expect(pool.size).toBe(2)
    expect(pool.addresses).toEqual(['0x01', '0x02'])
  })

  it('cycles wallets in round-robin', async () => {
    const { WalletPool } = await import('../src/upload/wallet-pool.js')
    const pool = await WalletPool.create(
      [{ privateKey: '0x01' }, { privateKey: '0x02' }],
      cfg => makeMockWallet(cfg.privateKey) as never,
    )
    const w1 = pool.next()
    const w2 = pool.next()
    const w3 = pool.next()
    expect((w1.account as { address: string }).address).toBe('0x01')
    expect((w2.account as { address: string }).address).toBe('0x02')
    expect((w3.account as { address: string }).address).toBe('0x01')
  })

  it('throws when created with zero wallets', async () => {
    const { WalletPool } = await import('../src/upload/wallet-pool.js')
    await expect(WalletPool.create([], () => makeMockWallet('0x0') as never)).rejects.toThrow()
  })
})
