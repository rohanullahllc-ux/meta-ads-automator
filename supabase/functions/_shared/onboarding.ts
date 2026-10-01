// Pure onboarding helpers (request validation and temporary passwords).
// No runtime-specific imports, so they run on Deno (Edge Functions) and Node (unit tests).

export type AccessRequestInput = {
  name: string
  email: string
  company: string | null
  facebook_profile: string | null
  message: string | null
}

export type AccessRequestResult =
  | { ok: true; honeypot: boolean; value: AccessRequestInput }
  | { ok: false; error: string }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export const normalizeEmail = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  const e = v.trim().toLowerCase()
  return e.length <= 200 && EMAIL.test(e) ? e : null
}

const clean = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length === 0 ? null : t.slice(0, max)
}

/**
 * Validates a public "request access" form. The hidden `website` field is a honeypot:
 * real people never fill it in, bots usually do. Such requests are accepted silently and discarded.
 */
export function validateAccessRequest(raw: unknown): AccessRequestResult {
  const r = (raw ?? {}) as Record<string, unknown>
  const empty = { name: '', email: '', company: null, facebook_profile: null, message: null }
  if (typeof r.website === 'string' && r.website.trim() !== '') return { ok: true, honeypot: true, value: empty }

  const name = clean(r.name, 100)
  if (!name) return { ok: false, error: 'Please enter your name.' }
  const email = normalizeEmail(r.email)
  if (!email) return { ok: false, error: 'Please enter a valid email address.' }

  return {
    ok: true,
    honeypot: false,
    value: {
      name,
      email,
      company: clean(r.company, 150),
      facebook_profile: clean(r.facebook_profile, 300),
      message: clean(r.message, 1000),
    },
  }
}

// No look-alike characters (0/O, 1/l/I) so a password read out or typed by hand is not misread.
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'

/** A random temporary password. Uses rejection sampling so every character is equally likely. */
export function generateTempPassword(length = 16): string {
  const limit = 256 - (256 % PASSWORD_ALPHABET.length)
  let out = ''
  while (out.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2))
    for (const b of bytes) {
      if (b < limit && out.length < length) out += PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length]
    }
  }
  return out
}
