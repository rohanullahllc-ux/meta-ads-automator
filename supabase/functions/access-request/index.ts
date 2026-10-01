// Public "request access" form handler. Anyone can call it, so it is defensive:
// strict validation, a honeypot field, an hourly cap, and duplicate suppression.
import { adminClient } from '../_shared/auth.ts'
import { handle, HttpError } from '../_shared/http.ts'
import { validateAccessRequest } from '../_shared/onboarding.ts'

const HOURLY_CAP = 20
const DAY_MS = 24 * 60 * 60 * 1000

Deno.serve((req) =>
  handle(req, async () => {
    const body = await req.json().catch(() => null)
    const v = validateAccessRequest(body)
    if (!v.ok) throw new HttpError(422, v.error)
    if (v.honeypot) return { ok: true } // pretend success so bots learn nothing

    const admin = adminClient()

    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count, error: countError } = await admin
      .from('access_requests')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', hourAgo)
    if (countError) throw countError
    if ((count ?? 0) >= HOURLY_CAP) throw new HttpError(429, 'We are getting a lot of requests. Please try again later.')

    // The same person asking twice in a week is recorded once.
    const { data: existing, error: dupError } = await admin
      .from('access_requests')
      .select('id')
      .eq('email', v.value.email)
      .eq('status', 'new')
      .gte('created_at', new Date(Date.now() - 7 * DAY_MS).toISOString())
      .limit(1)
    if (dupError) throw dupError

    if (!existing || existing.length === 0) {
      const { error } = await admin.from('access_requests').insert(v.value)
      if (error) throw error
    }
    return { ok: true }
  })
)
