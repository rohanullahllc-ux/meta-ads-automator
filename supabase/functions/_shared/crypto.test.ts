// Run with: node --test supabase/functions/_shared/crypto.test.ts   (Node 22.18+ strips TypeScript types)
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { decryptToken, encryptToken, signState, verifyState } from './crypto.ts'

const key = randomBytes(32).toString('base64')
const otherKey = randomBytes(32).toString('base64')

test('token encryption round-trips', async () => {
  const ct = await encryptToken('EAAB-secret-token', key, 'ws1:fb1')
  assert.ok(ct.startsWith('v1.'))
  assert.ok(!ct.includes('EAAB'))
  assert.equal(await decryptToken(ct, key, 'ws1:fb1'), 'EAAB-secret-token')
})

test('each encryption uses a fresh IV', async () => {
  const a = await encryptToken('same', key, 'x')
  const b = await encryptToken('same', key, 'x')
  assert.notEqual(a, b)
})

test('decryption fails with the wrong key, wrong row binding, or tampering', async () => {
  const ct = await encryptToken('token', key, 'ws1:fb1')
  await assert.rejects(decryptToken(ct, otherKey, 'ws1:fb1'))
  await assert.rejects(decryptToken(ct, key, 'ws2:fb1'))
  const [v, iv, body] = ct.split('.')
  const flipped = body.slice(0, -4) + (body.endsWith('AAAA') ? 'BBBB' : 'AAAA')
  await assert.rejects(decryptToken(`${v}.${iv}.${flipped}`, key, 'ws1:fb1'))
})

test('encryption key must be 32 bytes', async () => {
  await assert.rejects(encryptToken('t', randomBytes(16).toString('base64'), 'x'))
})

test('signed state verifies and returns its payload', async () => {
  const s = await signState({ uid: 'u1', exp: Date.now() + 60_000 }, key)
  const p = await verifyState<{ uid: string; exp: number }>(s, key)
  assert.equal(p?.uid, 'u1')
})

test('state is rejected when expired, forged, or signed with another key', async () => {
  const expired = await signState({ uid: 'u1', exp: Date.now() - 1 }, key)
  assert.equal(await verifyState(expired, key), null)

  const good = await signState({ uid: 'u1', exp: Date.now() + 60_000 }, key)
  assert.equal(await verifyState(good, otherKey), null)

  const [, sig] = good.split('.')
  const forgedBody = Buffer.from(JSON.stringify({ uid: 'attacker', exp: Date.now() + 60_000 })).toString('base64url')
  assert.equal(await verifyState(`${forgedBody}.${sig}`, key), null)

  assert.equal(await verifyState('garbage', key), null)
  assert.equal(await verifyState('a.b.c', key), null)
})
