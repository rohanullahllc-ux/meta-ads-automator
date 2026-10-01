// Web Crypto helpers for the Edge Functions.
// Only standard APIs are used, so the same file runs on Deno (Supabase) and Node (unit tests).

const enc = new TextEncoder()
const dec = new TextDecoder()

export function toBase64(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

export function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

const toBase64Url = (bytes: Uint8Array) =>
  toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

function fromBase64Url(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  return fromBase64(s.replace(/-/g, '+').replace(/_/g, '/') + pad)
}

// ---------------------------------------------------------------- token encryption (AES-256-GCM)

async function aesKey(base64Key: string): Promise<CryptoKey> {
  const raw = fromBase64(base64Key)
  if (raw.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes')
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

/**
 * Encrypts a secret for storage. `aad` binds the ciphertext to its row (e.g. "workspace:facebookUser"),
 * so a ciphertext copied onto another row fails to decrypt.
 * Format: v1.<iv>.<ciphertext+tag>, all base64.
 */
export async function encryptToken(plain: string, base64Key: string, aad: string): Promise<string> {
  const key = await aesKey(base64Key)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, key, enc.encode(plain)),
  )
  return `v1.${toBase64(iv)}.${toBase64(ct)}`
}

export async function decryptToken(payload: string, base64Key: string, aad: string): Promise<string> {
  const [version, ivB64, ctB64] = payload.split('.')
  if (version !== 'v1' || !ivB64 || !ctB64) throw new Error('Unsupported ciphertext format')
  const key = await aesKey(base64Key)
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(ivB64), additionalData: enc.encode(aad) },
    key,
    fromBase64(ctB64),
  )
  return dec.decode(plain)
}

// ---------------------------------------------------------------- signed OAuth state (HMAC-SHA256)

async function hmacKey(base64Key: string, usage: KeyUsage[]): Promise<CryptoKey> {
  const raw = fromBase64(base64Key)
  if (raw.length < 32) throw new Error('STATE_SIGNING_KEY must decode to at least 32 bytes')
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, usage)
}

export async function signState(payload: Record<string, unknown>, base64Key: string): Promise<string> {
  const body = toBase64Url(enc.encode(JSON.stringify(payload)))
  const key = await hmacKey(base64Key, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(body)))
  return `${body}.${toBase64Url(sig)}`
}

/** Returns the payload if the signature is valid and `exp` (ms since epoch) is in the future, else null. */
export async function verifyState<T extends { exp: number }>(
  state: string,
  base64Key: string,
  now = Date.now(),
): Promise<T | null> {
  const parts = state.split('.')
  if (parts.length !== 2) return null
  const [body, sig] = parts
  let sigBytes: Uint8Array
  try {
    sigBytes = fromBase64Url(sig)
  } catch {
    return null
  }
  const key = await hmacKey(base64Key, ['verify'])
  // crypto.subtle.verify compares in constant time.
  if (!(await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(body)))) return null
  let payload: T
  try {
    payload = JSON.parse(dec.decode(fromBase64Url(body)))
  } catch {
    return null
  }
  if (typeof payload.exp !== 'number' || payload.exp < now) return null
  return payload
}
