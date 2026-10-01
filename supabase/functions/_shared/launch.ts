// Pure launcher logic: validation, naming, budgets, Meta payload builders and error classification.
// No runtime-specific imports, so it runs on Deno (Edge Functions) and Node (unit tests).

export const CTAS = [
  'LEARN_MORE', 'SHOP_NOW', 'SIGN_UP', 'SUBSCRIBE', 'CONTACT_US',
  'GET_QUOTE', 'DOWNLOAD', 'APPLY_NOW', 'ORDER_NOW', 'BOOK_TRAVEL',
] as const
export type Cta = (typeof CTAS)[number]

export const MAX_ITEMS_PER_LAUNCH = 50

// ISO 3166-1 alpha-2 country codes, as used by Meta targeting.
const COUNTRY_CODES = new Set(
  (
    'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ ' +
    'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR ' +
    'GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP ' +
    'KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT ' +
    'MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW ' +
    'SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG ' +
    'UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'
  ).split(' '),
)

/** Upper-cases a country code and fixes the common "UK" mistake (the ISO and Meta code is GB). */
export function normalizeCountry(code: unknown): string {
  const c = String(code).trim().toUpperCase()
  return c === 'UK' ? 'GB' : c
}

// ------------------------------------------------------------------------------------------ money
// Meta takes budgets in the currency's smallest unit. Only currencies whose offset is well known are
// accepted; anything else is refused rather than guessed, because a wrong offset means a 100x budget.
const OFFSET_100 = [
  'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'AED', 'SAR',
  'PKR', 'INR', 'BDT', 'MXN', 'BRL', 'ZAR', 'TRY', 'SGD', 'HKD', 'MYR', 'PHP', 'THB', 'ILS', 'EGP', 'NGN',
]
const OFFSET_1 = ['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'PYG']

export function currencyOffset(currency: string | null | undefined): number | null {
  const c = (currency ?? '').toUpperCase()
  if (OFFSET_100.includes(c)) return 100
  if (OFFSET_1.includes(c)) return 1
  return null
}

/** Major units (e.g. 19.99) to Meta's minor units (1999). Null if the currency is unsupported or the amount invalid. */
export function toMinorUnits(amount: number, currency: string | null | undefined): number | null {
  const offset = currencyOffset(currency)
  if (offset === null || !Number.isFinite(amount) || amount <= 0) return null
  return Math.round(amount * offset)
}

export function formatMoney(minor: number, currency: string): string {
  const offset = currencyOffset(currency) ?? 100
  const digits = offset === 1 ? 0 : 2
  return `${currency.toUpperCase()} ${(minor / offset).toFixed(digits)}`
}

// -------------------------------------------------------------------------------------- shapes
export type AccountInfo = {
  currency: string | null
  min_daily_budget: number | string | null
  account_status: number | null
}

export type LaunchSettings = {
  objective: 'OUTCOME_TRAFFIC'
  campaign_name: string
  page_id: string
  structure: 'adset_per_ad' | 'single_adset'
  daily_budget_minor: number
  currency: string
  countries: string[]
  age_min: number
  age_max: number
  url_tags: string | null
  display: { daily_budget: string; total_daily_budget: string; ad_sets: number; ads: number }
}

export type PlannedItem = {
  position: number
  adset_name: string
  ad_name: string
  headline: string | null
  primary_text: string | null
  link_url: string
  cta: Cta
  image_path: string
}

export type ValidationResult =
  | { ok: true; settings: LaunchSettings; items: PlannedItem[]; warnings: string[] }
  | { ok: false; errors: string[] }

const IMAGE_PATH = /^[0-9a-f-]{36}\/[\w.-]+\.(png|jpe?g|webp)$/i

function text(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length === 0 ? null : t.slice(0, max)
}

function isHttpUrl(v: string): boolean {
  try {
    const u = new URL(v)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

// ------------------------------------------------------------------------------------ validation
/**
 * Checks a launch request against the ad account and returns the normalised settings and planned items,
 * or a list of plain-English errors. Never throws on bad input.
 */
export function validateLaunch(raw: unknown, account: AccountInfo, workspaceId: string): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const input = (raw ?? {}) as Record<string, unknown>

  const name = text(input.name, 150)
  if (!name) errors.push('Give the campaign a name.')

  const pageId = typeof input.page_id === 'string' ? input.page_id.trim() : ''
  if (!/^\d{5,20}$/.test(pageId)) errors.push('Choose the Facebook Page the ads will run from.')

  const structure = input.structure === 'single_adset' ? 'single_adset' : 'adset_per_ad'

  // Account checks
  if (account.account_status !== null && account.account_status !== undefined && account.account_status !== 1) {
    errors.push('This ad account is not active in Meta, so ads cannot be created. Check it in Ads Manager.')
  }
  const currency = (account.currency ?? '').toUpperCase()
  if (currencyOffset(currency) === null) {
    errors.push(
      currency
        ? `The account currency ${currency} is not supported yet. Budgets are only accepted in currencies we have verified.`
        : 'The account currency is unknown. Reconnect the Meta account and try again.',
    )
  }

  // Budget
  const dailyBudgetMinor = toMinorUnits(Number(input.daily_budget), currency)
  if (currencyOffset(currency) !== null) {
    if (dailyBudgetMinor === null) {
      errors.push('Enter a daily budget greater than zero.')
    } else {
      const min = Number(account.min_daily_budget)
      if (Number.isFinite(min) && min > 0) {
        if (dailyBudgetMinor < min) {
          errors.push(`The daily budget is below Meta's minimum for this account (${formatMoney(min, currency)} per ad set).`)
        } else if (dailyBudgetMinor > min * 100) {
          warnings.push('This daily budget is more than 100 times the account minimum. Double-check the amount.')
        }
      }
    }
  }

  // Targeting
  const countriesRaw = Array.isArray(input.countries) ? input.countries : []
  if (countriesRaw.some((c) => String(c).trim().toUpperCase() === 'UK')) {
    warnings.push('UK was changed to GB, the code Meta uses for the United Kingdom.')
  }
  const countries = [...new Set(countriesRaw.map(normalizeCountry))]
  if (countries.length === 0) errors.push('Add at least one target country.')
  else if (countries.length > 25) errors.push('Target at most 25 countries per launch.')
  else if (countries.some((c) => !/^[A-Z]{2}$/.test(c))) errors.push('Countries must be two-letter codes such as US or GB.')
  else {
    const unknown = countries.filter((c) => !COUNTRY_CODES.has(c))
    if (unknown.length > 0) errors.push(`${unknown.join(', ')} ${unknown.length === 1 ? 'is' : 'are'} not a valid country code.`)
  }

  const ageMin = Math.trunc(Number(input.age_min ?? 18))
  const ageMax = Math.trunc(Number(input.age_max ?? 65))
  if (!(ageMin >= 13 && ageMin <= 65) || !(ageMax >= 13 && ageMax <= 65)) errors.push('Ages must be between 13 and 65.')
  else if (ageMin > ageMax) errors.push('The minimum age cannot be higher than the maximum age.')

  const urlTags = text(input.url_tags, 500)
  if (urlTags && /\s/.test(urlTags)) errors.push('URL parameters must not contain spaces.')

  // Items
  const itemsRaw = Array.isArray(input.items) ? input.items : []
  if (itemsRaw.length === 0) errors.push('Add at least one creative.')
  if (itemsRaw.length > MAX_ITEMS_PER_LAUNCH) errors.push(`A launch can hold at most ${MAX_ITEMS_PER_LAUNCH} ads. Split it into two launches.`)

  const items: PlannedItem[] = []
  itemsRaw.slice(0, MAX_ITEMS_PER_LAUNCH).forEach((r, i) => {
    const n = i + 1
    const it = (r ?? {}) as Record<string, unknown>
    const imagePath = typeof it.image_path === 'string' ? it.image_path : ''
    if (!IMAGE_PATH.test(imagePath) || !imagePath.startsWith(`${workspaceId}/`)) {
      errors.push(`Ad ${n}: the image is missing or was not uploaded correctly.`)
    }
    const link = text(it.link_url, 2000)
    if (!link || !isHttpUrl(link)) errors.push(`Ad ${n}: enter a valid link starting with https://`)
    else if (link.startsWith('http://')) warnings.push(`Ad ${n}: the link is not https. Meta may reject or limit it.`)
    const cta = CTAS.includes(it.cta as Cta) ? (it.cta as Cta) : null
    if (!cta) errors.push(`Ad ${n}: choose a button (call to action).`)
    const headline = text(it.headline, 255)
    const primary = text(it.primary_text, 2000)
    if (headline && headline.length > 40) warnings.push(`Ad ${n}: the headline is over 40 characters and may be cut off.`)
    if (primary && primary.length > 125) warnings.push(`Ad ${n}: the primary text is over 125 characters and will be truncated in feed.`)

    items.push({
      position: n,
      adset_name: `${name ?? 'Launch'} | set ${structure === 'single_adset' ? 1 : n}`,
      ad_name: `${name ?? 'Launch'} | ad ${n}`,
      headline,
      primary_text: primary,
      link_url: link ?? '',
      cta: cta ?? 'LEARN_MORE',
      image_path: imagePath,
    })
  })

  if (errors.length > 0 || !name || dailyBudgetMinor === null) return { ok: false, errors }

  const adSets = structure === 'single_adset' ? 1 : items.length
  const settings: LaunchSettings = {
    objective: 'OUTCOME_TRAFFIC',
    campaign_name: name,
    page_id: pageId,
    structure,
    daily_budget_minor: dailyBudgetMinor,
    currency,
    countries,
    age_min: ageMin,
    age_max: ageMax,
    url_tags: urlTags,
    display: {
      daily_budget: formatMoney(dailyBudgetMinor, currency),
      total_daily_budget: formatMoney(dailyBudgetMinor * adSets, currency),
      ad_sets: adSets,
      ads: items.length,
    },
  }
  return { ok: true, settings, items, warnings }
}

// ------------------------------------------------------------------------------ Meta payloads
// Everything is created PAUSED. Nothing in this module can start spending.

export function campaignParams(s: LaunchSettings) {
  return {
    name: s.campaign_name,
    objective: s.objective,
    status: 'PAUSED',
    special_ad_categories: [] as string[],
    is_adset_budget_sharing_enabled: false, // required by Meta for campaigns with ad-set-level budgets
  }
}

export function adSetParams(s: LaunchSettings, campaignId: string, name: string) {
  return {
    name,
    campaign_id: campaignId,
    daily_budget: s.daily_budget_minor,
    billing_event: 'IMPRESSIONS',
    optimization_goal: 'LINK_CLICKS',
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP', // Meta rejects the ad set without an explicit bid strategy
    destination_type: 'WEBSITE',
    status: 'PAUSED',
    targeting: {
      // normalised again here so jobs saved before the UK fix still send valid codes
      geo_locations: { countries: [...new Set(s.countries.map(normalizeCountry))] },
      age_min: s.age_min,
      age_max: s.age_max,
      targeting_automation: { advantage_audience: 0 },
    },
  }
}

export function creativeParams(s: LaunchSettings, item: PlannedItem, imageHash: string) {
  return {
    name: item.ad_name,
    object_story_spec: {
      page_id: s.page_id,
      link_data: {
        link: item.link_url,
        ...(item.primary_text ? { message: item.primary_text } : {}),
        ...(item.headline ? { name: item.headline } : {}),
        image_hash: imageHash,
        call_to_action: { type: item.cta, value: { link: item.link_url } },
      },
    },
    ...(s.url_tags ? { url_tags: s.url_tags } : {}),
  }
}

export function adParams(adsetId: string, creativeId: string, name: string) {
  return { name, adset_id: adsetId, creative: { creative_id: creativeId }, status: 'PAUSED' }
}

// --------------------------------------------------------------------------- error classification
export type MetaErrorInfo = {
  code?: number
  subcode?: number
  message?: string
  userMessage?: string
  userTitle?: string
}
export type ErrorKind = 'billing' | 'app_mode' | 'auth' | 'permission' | 'rate_limit' | 'not_found' | 'other'

const RATE_LIMIT_CODES = [4, 17, 32, 613, 80000, 80001, 80002, 80003, 80004, 80005, 80006, 80008, 80009, 80014]

/** Turns a Meta error into a plain-English message and a kind that decides how the launcher reacts. */
export function classifyMetaError(e: MetaErrorInfo): { kind: ErrorKind; message: string } {
  if (e.subcode === 1359188) {
    return {
      kind: 'billing',
      message: 'This ad account has no usable payment method. Add one in Meta Ads Manager billing settings, then retry.',
    }
  }
  if (e.subcode === 1885183) {
    // Verified 2026-10-01: an app in development mode cannot create ad creatives (they create a Page post).
    return {
      kind: 'app_mode',
      message:
        'The Meta app is still in development mode, and Meta does not let such apps create ad creatives. Switch the app to Live in the Meta developer dashboard, then retry.',
    }
  }
  if (e.code === 190 || e.code === 102) {
    return { kind: 'auth', message: 'The Meta connection has expired or was revoked. Reconnect the Meta account, then retry.' }
  }
  if (e.code === 200 || e.code === 10 || e.code === 283) {
    return {
      kind: 'permission',
      message: 'Meta says this login does not have permission for this ad account or Page. Check your access in Business Settings.',
    }
  }
  if (e.code !== undefined && RATE_LIMIT_CODES.includes(e.code)) {
    return { kind: 'rate_limit', message: 'Meta is rate limiting requests. The launch will continue shortly.' }
  }
  if (e.code === 100 && e.subcode === 33) {
    return { kind: 'not_found', message: 'Meta could not find this object. It may already be deleted.' }
  }
  const detail = e.userMessage ?? e.message ?? 'Unknown error'
  const codes = e.code !== undefined ? ` (Meta error ${e.code}${e.subcode !== undefined ? `/${e.subcode}` : ''})` : ''
  return { kind: 'other', message: `${detail}${codes}` }
}
