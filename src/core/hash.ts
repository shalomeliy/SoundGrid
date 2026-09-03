/**
 * Formats a digest as lowercase hex. The digest itself is a platform concern
 * (`crypto.subtle.digest` is a browser API, not something `core/` may call
 * directly) — this is the one pure sliver of "compute a hash" that belongs
 * here, shared by every caller that turns a `SubtleCrypto` result into the
 * string used as a content-hash cache key.
 */
export function bytesToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let hex = ''
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0')
  }
  return hex
}
