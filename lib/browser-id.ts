interface CryptoSource {
  randomUUID?: () => string
  getRandomValues?: (array: Uint8Array) => Uint8Array
}

/**
 * `Crypto.randomUUID` is defined only in a secure context, so a phone opening
 * the dev server over plain http gets `undefined` and calling it throws.
 * `getRandomValues` is exempt from that rule, so build the v4 shape from it;
 * these ids only key a tab or a queued disposition, they are not secrets.
 */
export function createBrowserId(): string {
  const cryptoApi = (globalThis as { crypto?: CryptoSource }).crypto

  if (typeof cryptoApi?.randomUUID === "function") {
    return cryptoApi.randomUUID()
  }

  const bytes = new Uint8Array(16)

  if (typeof cryptoApi?.getRandomValues === "function") {
    cryptoApi.getRandomValues(bytes)
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256)
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
