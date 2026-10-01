// Run with: node --test supabase/functions/_shared/launch.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  adParams, adSetParams, campaignParams, classifyMetaError, creativeParams, currencyOffset,
  formatMoney, toMinorUnits, validateLaunch, type AccountInfo,
} from './launch.ts'

const WS = '11111111-2222-3333-4444-555555555555'
const account: AccountInfo = { currency: 'PKR', min_daily_budget: 27850, account_status: 1 }
const img = (n: string) => `${WS}/${n}.png`

const good = () => ({
  name: 'Spring sale',
  page_id: '1402948519567140',
  structure: 'adset_per_ad',
  daily_budget: 500,
  countries: ['us', 'GB', 'us'],
  age_min: 25,
  age_max: 55,
  url_tags: 'utm_source=facebook&utm_medium=paid',
  items: [
    { image_path: img('a'), headline: 'Hello', primary_text: 'Buy now', link_url: 'https://example.com/a', cta: 'SHOP_NOW' },
    { image_path: img('b'), headline: 'World', primary_text: 'Hurry', link_url: 'https://example.com/b', cta: 'LEARN_MORE' },
  ],
})

test('money conversion uses the right offset and rounds safely', () => {
  assert.equal(toMinorUnits(19.99, 'USD'), 1999)
  assert.equal(toMinorUnits(500, 'PKR'), 50000)
  assert.equal(toMinorUnits(1000, 'JPY'), 1000)
  assert.equal(toMinorUnits(0.29, 'USD'), 29) // 0.29 * 100 = 28.999999999999996
  assert.equal(toMinorUnits(10, 'XYZ'), null)
  assert.equal(toMinorUnits(0, 'USD'), null)
  assert.equal(toMinorUnits(-5, 'USD'), null)
  assert.equal(toMinorUnits(NaN, 'USD'), null)
  assert.equal(currencyOffset(null), null)
  assert.equal(formatMoney(50000, 'pkr'), 'PKR 500.00')
  assert.equal(formatMoney(1000, 'JPY'), 'JPY 1000')
})

test('a valid launch is normalised', () => {
  const r = validateLaunch(good(), account, WS)
  assert.ok(r.ok)
  if (!r.ok) return
  assert.equal(r.settings.daily_budget_minor, 50000)
  assert.deepEqual(r.settings.countries, ['US', 'GB'])
  assert.equal(r.settings.display.ads, 2)
  assert.equal(r.settings.display.ad_sets, 2)
  assert.equal(r.settings.display.total_daily_budget, 'PKR 1000.00')
  assert.equal(r.items[1].adset_name, 'Spring sale | set 2')
  assert.equal(r.items[1].ad_name, 'Spring sale | ad 2')
})

test('single ad set structure shares one ad set and one budget', () => {
  const r = validateLaunch({ ...good(), structure: 'single_adset' }, account, WS)
  assert.ok(r.ok)
  if (!r.ok) return
  assert.equal(r.settings.display.ad_sets, 1)
  assert.equal(r.settings.display.total_daily_budget, 'PKR 500.00')
  assert.equal(r.items[0].adset_name, r.items[1].adset_name)
})

test('budget below the account minimum is refused with the minimum shown', () => {
  const r = validateLaunch({ ...good(), daily_budget: 100 }, account, WS)
  assert.ok(!r.ok)
  if (r.ok) return
  assert.match(r.errors.join(' '), /below Meta's minimum.*PKR 278\.50/)
})

test('a huge budget only warns', () => {
  const r = validateLaunch({ ...good(), daily_budget: 50000 }, account, WS)
  assert.ok(r.ok)
  if (!r.ok) return
  assert.match(r.warnings.join(' '), /100 times/)
})

test('unsupported currency and inactive account are refused', () => {
  assert.ok(!validateLaunch(good(), { ...account, currency: 'XYZ' }, WS).ok)
  assert.ok(!validateLaunch(good(), { ...account, currency: null }, WS).ok)
  assert.ok(!validateLaunch(good(), { ...account, account_status: 2 }, WS).ok)
})

test('bad inputs produce readable errors and never throw', () => {
  for (const bad of [null, undefined, 42, 'x', [], {}]) {
    const r = validateLaunch(bad, account, WS)
    assert.ok(!r.ok)
  }
  const r = validateLaunch(
    {
      ...good(),
      name: '  ',
      page_id: 'abc',
      countries: ['USA'],
      age_min: 70,
      items: [{ image_path: '../../etc/passwd', link_url: 'javascript:alert(1)', cta: 'HACK' }],
    },
    account,
    WS,
  )
  assert.ok(!r.ok)
  if (r.ok) return
  const all = r.errors.join(' | ')
  assert.match(all, /campaign a name/)
  assert.match(all, /Facebook Page/)
  assert.match(all, /two-letter/)
  assert.match(all, /between 13 and 65/)
  assert.match(all, /image is missing/)
  assert.match(all, /valid link/)
  assert.match(all, /button/)
})

test('UK is corrected to GB and unknown country codes are refused', () => {
  const uk = validateLaunch({ ...good(), countries: ['US', 'UK', 'gb', 'CA'] }, account, WS)
  assert.ok(uk.ok)
  if (uk.ok) {
    assert.deepEqual(uk.settings.countries, ['US', 'GB', 'CA'])
    assert.match(uk.warnings.join(' '), /UK was changed to GB/)
  }
  const bad = validateLaunch({ ...good(), countries: ['US', 'ZZ', 'QQ'] }, account, WS)
  assert.ok(!bad.ok)
  if (!bad.ok) assert.match(bad.errors.join(' '), /ZZ, QQ are not a valid country code/)
  const ae = validateLaunch({ ...good(), countries: ['AE', 'AU', 'PK'] }, account, WS)
  assert.ok(ae.ok)
})

test('ad set payload repairs a legacy UK saved before the fix', () => {
  const r = validateLaunch(good(), account, WS)
  assert.ok(r.ok)
  if (!r.ok) return
  const legacy = { ...r.settings, countries: ['US', 'UK', 'GB'] }
  assert.deepEqual(adSetParams(legacy, '1', 'x').targeting.geo_locations.countries, ['US', 'GB'])
})

test('images must live in the caller workspace folder', () => {
  const other = '99999999-2222-3333-4444-555555555555'
  const g = good()
  g.items[0].image_path = `${other}/a.png`
  const r = validateLaunch(g, account, WS)
  assert.ok(!r.ok)
})

test('limits: no items, too many items, min age above max age', () => {
  assert.ok(!validateLaunch({ ...good(), items: [] }, account, WS).ok)
  const many = Array.from({ length: 51 }, (_, i) => ({ ...good().items[0], image_path: img(`n${i}`) }))
  assert.ok(!validateLaunch({ ...good(), items: many }, account, WS).ok)
  assert.ok(!validateLaunch({ ...good(), age_min: 50, age_max: 30 }, account, WS).ok)
})

test('long copy and http links warn but do not block', () => {
  const g = good()
  g.items[0].headline = 'x'.repeat(60)
  g.items[0].primary_text = 'y'.repeat(200)
  g.items[0].link_url = 'http://example.com'
  const r = validateLaunch(g, account, WS)
  assert.ok(r.ok)
  if (!r.ok) return
  assert.equal(r.warnings.length, 3)
})

test('Meta payloads are always paused and match the shapes verified against the live API', () => {
  const r = validateLaunch(good(), account, WS)
  assert.ok(r.ok)
  if (!r.ok) return
  const c = campaignParams(r.settings)
  assert.equal(c.status, 'PAUSED')
  assert.deepEqual(c.special_ad_categories, [])
  assert.equal(c.is_adset_budget_sharing_enabled, false)

  const a = adSetParams(r.settings, '123', 'set 1')
  assert.equal(a.status, 'PAUSED')
  assert.equal(a.bid_strategy, 'LOWEST_COST_WITHOUT_CAP')
  assert.equal(a.daily_budget, 50000)
  assert.deepEqual(a.targeting.geo_locations.countries, ['US', 'GB'])

  const cr = creativeParams(r.settings, r.items[0], 'HASH')
  assert.equal(cr.object_story_spec.link_data.image_hash, 'HASH')
  assert.equal(cr.object_story_spec.page_id, '1402948519567140')
  assert.equal(cr.object_story_spec.link_data.call_to_action.type, 'SHOP_NOW')
  assert.equal(cr.url_tags, 'utm_source=facebook&utm_medium=paid')

  const ad = adParams('A', 'C', 'ad 1')
  assert.equal(ad.status, 'PAUSED')
  assert.deepEqual(ad.creative, { creative_id: 'C' })
})

test('creative omits empty copy fields', () => {
  const g = good()
  g.items[0].headline = ''
  g.items[0].primary_text = ''
  g.url_tags = ''
  const r = validateLaunch(g, account, WS)
  assert.ok(r.ok)
  if (!r.ok) return
  const cr = creativeParams(r.settings, r.items[0], 'H')
  assert.ok(!('message' in cr.object_story_spec.link_data))
  assert.ok(!('name' in cr.object_story_spec.link_data))
  assert.ok(!('url_tags' in cr))
})

test('Meta errors are classified', () => {
  assert.equal(classifyMetaError({ code: 100, subcode: 1359188 }).kind, 'billing')
  assert.equal(classifyMetaError({ code: 100, subcode: 1885183 }).kind, 'app_mode')
  assert.match(classifyMetaError({ code: 100, subcode: 1885183 }).message, /development mode/)
  assert.equal(classifyMetaError({ code: 190 }).kind, 'auth')
  assert.equal(classifyMetaError({ code: 200 }).kind, 'permission')
  assert.equal(classifyMetaError({ code: 17 }).kind, 'rate_limit')
  assert.equal(classifyMetaError({ code: 80004 }).kind, 'rate_limit')
  assert.equal(classifyMetaError({ code: 100, subcode: 33 }).kind, 'not_found')
  const other = classifyMetaError({ code: 100, subcode: 2490487, userMessage: 'Bid amount required' })
  assert.equal(other.kind, 'other')
  assert.match(other.message, /Bid amount required.*100\/2490487/)
  assert.equal(classifyMetaError({}).kind, 'other')
})
