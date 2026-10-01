// Shared HTTP plumbing for Edge Functions (Deno runtime).

export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function mustEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value) {
    console.error(`Missing required secret: ${name}`)
    throw new Error('Server is not configured')
  }
  return value
}

/** Origins the web app may run on, e.g. "http://localhost:5173,https://app.example.com". */
export function allowedOrigins(): string[] {
  return (Deno.env.get('APP_ORIGINS') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** CORS, method checks, JSON in/out and error mapping. Handlers just return a value or throw HttpError. */
export async function handle(req: Request, fn: () => Promise<unknown>): Promise<Response> {
  const origin = req.headers.get('origin') ?? ''
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Vary: 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
  if (allowedOrigins().includes(origin)) headers['Access-Control-Allow-Origin'] = origin

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers })
  }

  try {
    return new Response(JSON.stringify(await fn()), { status: 200, headers })
  } catch (err) {
    if (err instanceof HttpError) {
      return new Response(JSON.stringify({ error: err.message }), { status: err.status, headers })
    }
    // Never echo internal errors to the client. Log them (without secrets) for the dashboard logs.
    console.error('Unhandled error:', err instanceof Error ? err.message : JSON.stringify(err))
    return new Response(JSON.stringify({ error: 'Something went wrong. Please try again.' }), {
      status: 500,
      headers,
    })
  }
}
