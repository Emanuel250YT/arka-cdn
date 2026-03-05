/**
 * UUID v4 generation — isomorphic (browser + Node.js).
 * Uses `globalThis.crypto.randomUUID()` which is available in:
 *  - All modern browsers
 *  - Node.js 14.17.0+
 *
 * If needed in older environments, a fallback polyfill is applied.
 */

export function generateUUID(): string {
  if (
    typeof globalThis.crypto !== 'undefined'
    && typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return globalThis.crypto.randomUUID()
  }

  // Minimal v4 UUID polyfill for environments without Web Crypto
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * Returns a short (8-char) collision-resistant identifier derived from a UUID.
 * Useful for logging / debugging.
 */
export function shortId(uuid: string): string {
  return uuid.replace(/-/g, '').slice(0, 8)
}
