// Run with: node --test supabase/functions/_shared/onboarding.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { generateTempPassword, normalizeEmail, validateAccessRequest } from './onboarding.ts'

test('a valid request is cleaned and lower-cases the email', () => {
  const r = validateAccessRequest({
    name: '  Sara Khan ',
    email: ' Sara@Example.COM ',
    company: ' Growth Co ',
    facebook_profile: 'https://facebook.com/sara',
    message: 'I run ads for 6 clients.',
  })
  assert.ok(r.ok && !r.honeypot)
  if (!r.ok) return
  assert.equal(r.value.name, 'Sara Khan')
  assert.equal(r.value.email, 'sara@example.com')
  assert.equal(r.value.company, 'Growth Co')
})

test('optional fields can be empty', () => {
  const r = validateAccessRequest({ name: 'A', email: 'a@b.co', company: '', message: '   ' })
  assert.ok(r.ok)
  if (!r.ok) return
  assert.equal(r.value.company, null)
  assert.equal(r.value.message, null)
})

test('bad input is rejected with a readable message and never throws', () => {
  for (const bad of [null, undefined, 5, 'x', [], {}]) assert.ok(!validateAccessRequest(bad).ok)
  assert.match((validateAccessRequest({ email: 'a@b.co' }) as { error: string }).error, /name/)
  assert.match((validateAccessRequest({ name: 'A', email: 'not-an-email' }) as { error: string }).error, /email/)
  assert.match((validateAccessRequest({ name: 'A', email: 'a@b' }) as { error: string }).error, /email/)
})

test('the honeypot field marks bot requests', () => {
  const r = validateAccessRequest({ name: 'Bot', email: 'bot@spam.io', website: 'http://spam.example' })
  assert.ok(r.ok && r.honeypot)
})

test('very long fields are truncated', () => {
  const r = validateAccessRequest({ name: 'n'.repeat(500), email: 'a@b.co', message: 'm'.repeat(5000) })
  assert.ok(r.ok)
  if (!r.ok) return
  assert.equal(r.value.name.length, 100)
  assert.equal(r.value.message?.length, 1000)
})

test('email normalisation', () => {
  assert.equal(normalizeEmail(' X@Y.io '), 'x@y.io')
  assert.equal(normalizeEmail('x@y'), null)
  assert.equal(normalizeEmail(`${'a'.repeat(200)}@y.io`), null)
  assert.equal(normalizeEmail(42), null)
})

test('temporary passwords are the right length, unambiguous and different each time', () => {
  const seen = new Set<string>()
  for (let i = 0; i < 200; i++) {
    const p = generateTempPassword()
    assert.equal(p.length, 16)
    assert.match(p, /^[A-HJ-NP-Za-km-z2-9]+$/)
    seen.add(p)
  }
  assert.equal(seen.size, 200)
  assert.equal(generateTempPassword(24).length, 24)
})

test('password characters are evenly distributed (no obvious modulo bias)', () => {
  const counts = new Map<string, number>()
  const n = 40000
  for (let i = 0; i < n / 16; i++) for (const c of generateTempPassword()) counts.set(c, (counts.get(c) ?? 0) + 1)
  const expected = n / 57 // the alphabet has 24 + 25 + 8 = 57 characters
  for (const [, v] of counts) assert.ok(Math.abs(v - expected) < expected * 0.35)
  assert.equal(counts.size, 57)
})
