/**
 * AES-256-CBC encryption/decryption with PBKDF2 key derivation.
 *
 * Fully isomorphic: works in Node.js 15+ and all modern browsers
 * via the Web Crypto API (`globalThis.crypto.subtle`).
 *
 * Key derivation parameters:
 *  - Algorithm : PBKDF2
 *  - Hash      : SHA-256
 *  - Iterations: 100 000
 *  - Key length: 256 bits
 *
 * Cipher: AES-256-CBC with a random 16-byte IV and a random 16-byte salt.
 */

import type { EncryptedData } from '../types.js'

// ────────────────────────────────────────────────────────────────────────────
// Hex helpers
// ────────────────────────────────────────────────────────────────────────────

function toHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  if (hex.length % 2 !== 0)
    throw new Error(`Invalid hex string (odd length): ${hex.length}`)
  const buf = new Uint8Array(new ArrayBuffer(hex.length / 2))
  for (let i = 0; i < buf.length; i++) {
    buf[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return buf
}

// ────────────────────────────────────────────────────────────────────────────
// Key derivation
// ────────────────────────────────────────────────────────────────────────────

async function deriveKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  usage: KeyUsage[],
): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const keyMaterial = await globalThis.crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey'],
  )
  return globalThis.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-CBC', length: 256 },
    false,
    usage,
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

/**
 * Encrypts arbitrary binary data.
 *
 * @param data    - Raw bytes to encrypt
 * @param phrase  - Public phrase (shared with authorised consumers)
 * @param secret  - Private secret (kept by the uploader)
 * @returns       Salt, IV and ciphertext all as hex strings
 */
/** Create an ArrayBuffer-backed Uint8Array suitable for Web Crypto API */
function newBuffer(size: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array(new ArrayBuffer(size))
}

export async function encrypt(
  data: Uint8Array,
  phrase: string,
  secret: string,
): Promise<EncryptedData> {
  const password = phrase + secret
  const salt = newBuffer(16)
  const iv = newBuffer(16)
  globalThis.crypto.getRandomValues(salt)
  globalThis.crypto.getRandomValues(iv)

  const key = await deriveKey(password, salt, ['encrypt'])

  const ciphertext = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-CBC', iv },
    key,
    data.buffer instanceof ArrayBuffer
      ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
      : new Uint8Array(data).buffer as ArrayBuffer,
  )

  return {
    data: toHex(ciphertext),
    salt: toHex(salt),
    iv: toHex(iv),
  }
}

/**
 * Decrypts data previously encrypted with {@link encrypt}.
 *
 * @param encrypted - Object returned by `encrypt`
 * @param phrase    - Public phrase
 * @param secret    - Private secret
 * @returns         Original plaintext bytes
 */
export async function decrypt(
  encrypted: EncryptedData,
  phrase: string,
  secret: string,
): Promise<Uint8Array> {
  const password = phrase + secret
  const salt = fromHex(encrypted.salt)
  const iv = fromHex(encrypted.iv)
  const ciphertext = fromHex(encrypted.data)

  const key = await deriveKey(password, salt, ['decrypt'])

  const plaintext = await globalThis.crypto.subtle.decrypt(
    { name: 'AES-CBC', iv },
    key,
    ciphertext.buffer as ArrayBuffer,
  )

  return new Uint8Array(plaintext)
}

/**
 * Convenience: encrypts a UTF-8 string and returns hex-encoded ciphertext.
 */
export async function encryptString(
  text: string,
  phrase: string,
  secret: string,
): Promise<EncryptedData> {
  const enc = new TextEncoder()
  return encrypt(enc.encode(text), phrase, secret)
}

/**
 * Convenience: decrypts ciphertext back to a UTF-8 string.
 */
export async function decryptString(
  encrypted: EncryptedData,
  phrase: string,
  secret: string,
): Promise<string> {
  const bytes = await decrypt(encrypted, phrase, secret)
  const dec = new TextDecoder()
  return dec.decode(bytes)
}
