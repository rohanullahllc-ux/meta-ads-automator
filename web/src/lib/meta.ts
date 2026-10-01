import { callFunction } from './api'

const STATE_KEY = 'meta_oauth_state'

/** Asks the server for a Facebook login URL, then sends the browser there. */
export async function startMetaConnect(): Promise<void> {
  const data = await callFunction<{ url: string; state: string }>('meta-connect-start', {
    origin: window.location.origin,
  })
  sessionStorage.setItem(STATE_KEY, data.state)
  window.location.assign(data.url)
}

/** Sends the login code to the server, which exchanges it and stores the connection. */
export async function completeMetaConnect(code: string, state: string): Promise<{ ad_accounts: number }> {
  const expected = sessionStorage.getItem(STATE_KEY)
  sessionStorage.removeItem(STATE_KEY)
  if (expected !== state) {
    throw new Error('This connection attempt did not start in this browser tab. Please try again.')
  }
  return callFunction<{ ad_accounts: number }>('meta-connect-complete', { code, state })
}
