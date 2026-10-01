# Meta Ads Automator: Build Plan

Status: draft v1, 2026-09-30
Constraints: bootstrapped, **$0/month infrastructure budget**, one founder coding with Claude Code.
Decisions so far: MVP is a **bulk campaign launcher**. Stack is custom code on free tiers. First customer is undecided (recommendation below).

Anything marked **[verify]** is from memory or search snippets. Confirm it on the vendor's page before you depend on it.

---

## 1. Product in one paragraph

A web app where a media buyer connects a Meta ad account, defines a launch template once (campaign objective, budget, targeting, placements, naming convention, UTM rules), then drops in many creatives and copy variants. The app validates everything, shows a preview, and creates the campaign, ad sets and ads in Meta in one run, **paused by default**, with an audit trail and one-click undo. Rules automation (pause losers, scale winners) comes after launch, and it reuses the same Meta plumbing.

## 2. Who to sell to first (recommendation)

You picked "not sure", so here is a default to challenge:

**Freelance media buyers and small agencies (3-20 client accounts).**

- Bulk launching is their biggest repeated time sink, so the pain is real and easy to explain in one sentence.
- They pay more per seat ($49-149/month), so about 20 customers gets you to roughly $1-2k MRR.
- They can be found where they gather (Facebook groups, Reddit, X, LinkedIn), which costs no ad spend.
- Solo Shopify owners churn faster and want a "do it for me" product, which is a different and bigger build.

Validate before building further: talk to 5-10 of them this week. Ask how they launch ads today, how long a batch takes, and what they would pay to make it 10x faster.

## 3. Cost strategy: the only unavoidable spend

| Item | Cost | Notes |
|---|---|---|
| Domain | ~$10-15/year | The only real cost at $0/month. |
| Hosting | $0 | Cloudflare Pages/Workers free tier, which allows commercial use. **Do not use Vercel Hobby.** Its terms limit it to personal, non-commercial use **[verify]**. |
| Database, auth, storage, functions, cron | $0 | Supabase free tier **[verify limits]**: about 500 MB database, 1 GB storage, 50k monthly active users, projects pause after about a week of inactivity, no backups. |
| Email | $0 | Resend free tier, about 3,000 emails/month and 100/day **[verify]**. |
| Error monitoring | $0 | Sentry free tier. |
| Meta Marketing API | $0 | No per-call fee. Cost is the App Review effort, not money. |
| Payments | 0 fixed, % per sale | Founder is in Pakistan with no company, so Stripe is out. See section 3a. |
| LLMs | $0 in MVP | No AI features in v1. Later: bring-your-own API key or a paid add-on. |

### 3a. Getting paid from Pakistan without a company

Facts from the founder: based in Pakistan, selling to international customers, no company, will not register one, wants free platforms.

| Route | Fits when | Cost | Catch |
|---|---|---|---|
| **Direct invoice via Payoneer** (payment requests to the client) | First 5-10 pilot clients. No website billing needed. | Payoneer's own fees **[verify]** | Manual invoicing and no card autopay. Fine at 5-10 clients. |
| **Paddle** (merchant of record) | Automated subscriptions after the pilot | About 5% + $0.50 per transaction, no monthly fee **[verify]**. Paid out via wire or Payoneer. | Paddle reviews every seller, and an individual may be refused. It needs a live site with pricing, terms and refund policy **[verify]**. |
| **Lemon Squeezy** (merchant of record) | Fallback if Paddle refuses | Higher fees, about 7% + $0.50 for international subscriptions **[verify]** | Payouts by bank wire or PayPal, and PayPal doesn't work for individuals in Pakistan, so it would be a wire. |
| Polar, Whop, Gumroad | Unchecked | | Check payout support for Pakistan before considering them. |

Payoneer has two ways to collect, and the founder confirmed both exist:

| Method | How the client pays | Fee (search snippets, **[verify]**) | Limits |
|---|---|---|---|
| **Payment request** | Card, bank transfer, ACH debit (US), PayPal or Payoneer balance | Card about 3%. ACH about 1%. The payer can be asked to cover the fee. | Works for clients anywhere. |
| **USD receiving account** (US bank details) | Local USD bank transfer (ACH), sent from a **business** bank account | Lower, but unchecked | Payer must send local USD from a business account, so freelancers paying from a personal account, and clients outside the US, are excluded. |

**Tested by the founder (2026-09-30):** the standard payment request offers only two choices, (a) Payoneer to Payoneer, where the client needs a Payoneer account, and (b) pay from bank, where the client sends a US local transfer to the founder's receiving-account details. No card option appeared. The third mode, "Pay and generate invoices", is untested because it needs a logo and tax ID. It may be where card payment lives, but that is unconfirmed.

Founder update: card payment is not available on the founder's new Payoneer account until it has received $100 (per the founder, **[verify]** in Payoneer's help). It is available on a family member's account, but collecting the founder's business income through someone else's account is not recommended (see chat advice): account holders are the ones Payoneer verifies, and mismatched names risk frozen funds. Plan: let the first founding clients pay by bank or Payoneer-to-Payoneer, which should cross the threshold and unlock card.

Consequences: for now the reachable clients are US agencies with a business bank account, or anyone willing to open a free Payoneer account. Clients elsewhere, and freelancers paying from personal accounts, may be blocked until the invoice mode or another receiving account (EUR or GBP, if Payoneer offers them to the founder **[verify]**) is confirmed. Payoneer's withdrawal fee to a Pakistani bank has not been checked.

Plan: invoice the pilot clients through Payoneer, apply to Paddle once the landing page, pricing page and policies are live (phase 1), and keep Lemon Squeezy as a fallback. Build billing behind a small interface so the provider can be swapped.

Free-tier watch list (upgrade triggers), in the order you will probably hit them:
1. Supabase project pausing from inactivity. Fix it with a cron ping, or upgrade to Pro (~$25/month **[verify]**) at your first paying customers.
2. Supabase database size, once audit logs and job history grow.
3. Supabase Edge Function invocation and CPU-time limits, for large launches. This is why launches are chunked (section 6).
4. Storage for creatives. The design avoids it by uploading straight to Meta and keeping only IDs and hashes.

### 3b. How billing is built into the app (Payoneer-assisted)

Payoneer's public API is aimed at marketplaces, mass payouts and merchant Checkout. I found nothing showing that an individual account can create payment requests or receive "paid" webhooks through an API **[verify with Payoneer support before assuming either way]**. So the MVP does not call Payoneer. The app is the **source of truth for who owes what**, and the founder does the Payoneer step by hand.

Flow:
1. A client is put on a plan (price, billing period, founding-client price locked in) and gets an invoice record with a unique number, e.g. `MAA-2026-0007`.
2. The admin screen shows "due in the next 7 days". The founder creates the Payoneer payment request or invoice by hand, using the invoice number as the reference, and pastes the request link into the app. The app emails the client the link and amount through Resend.
3. When Payoneer shows the money received, the founder clicks **Mark paid** and enters the Payoneer reference. The app extends the subscription period, stores a payment record and emails a receipt.
4. A daily cron job flags overdue invoices, sends reminders, and after a grace period (suggest 5 days) blocks **new launches only**. It never pauses or edits a client's live ads.

Data: `plans`, `subscriptions` (workspace, plan, status, current period end, locked price), `invoices` (number, amount, currency, period, status draft/sent/paid/overdue/void, due date, payment link, Payoneer reference, paid at), `payments`. Plan limits (ad accounts, ads per month) are enforced in code from the subscription status, and the status changes go in `audit_log`.

Billing sits behind a `BillingProvider` interface. Today's provider is `manual_payoneer`. A later `paddle` provider would create subscriptions and receive webhooks, and nothing else in the app changes.

The app never touches card data, so there is no PCI burden.

Build it in phase 4 (private beta). It is about 2-3 days of work. Until then, a spreadsheet is enough.

## 4. Architecture

```
Browser (React + Vite + TypeScript, Cloudflare Pages)
   |
   |  Supabase Auth (email + Google login)
   v
Supabase
  - Postgres (RLS on every table, tenant = workspace)
  - Edge Functions (Deno/TypeScript): Meta OAuth callback, Meta API proxy, launch worker, rules worker
  - pg_cron: triggers the launch worker and rules worker on a schedule
  - Storage: temporary creative staging only, deleted after upload to Meta
   |
   v
Meta Marketing API (Graph API, current stable version)
```

Why this shape:
- One backend (Supabase) instead of a server, a queue and a database to pay for and operate.
- Meta tokens and API calls stay server-side, never in the browser.
- Launches run as background jobs, so a 200-ad launch does not depend on the browser tab staying open.
- If you outgrow it, Postgres and TypeScript move cleanly to a real server later.

## 5. Data model (MVP)

- `workspaces`, `workspace_members` (roles: owner, editor, viewer). Agencies need multi-user from day one.
- `meta_connections`: workspace, Facebook user id, **encrypted** access token, expiry, scopes, status.
- `ad_accounts`: workspace, connection, Meta account id, name, currency, timezone, status.
- `launch_templates`: reusable settings (objective, budget type, optimization goal, targeting JSON, placements, naming pattern, URL/UTM pattern, Page and Instagram identity).
- `launch_jobs`: template snapshot, status (draft, validating, ready, running, partial, done, failed, undone), counts, created by.
- `launch_items`: one row per ad. It holds the creative reference, copy variant, target ad set, and the Meta IDs once created, plus an error message and retry count.
- `assets`: Meta image hash or video id per ad account, with file name and dimensions.
- `audit_log`: every write to Meta (who, what, request summary, response, time). This is your defence when a customer says "the tool broke my account".
- `subscriptions`: plan, status, limits (ad accounts, launches per month).

Security: encrypt tokens at rest (Supabase Vault or AES-GCM with a key held in function secrets). Never log tokens. Row Level Security on everything, tested with a second dummy workspace.

## 6. The bulk launcher: how it actually works

**Inputs**
1. Pick ad account and template (or build one).
2. Add creatives by drag-and-drop (images and videos) or a spreadsheet import (CSV/Google Sheet export) with columns like headline, primary text, CTA, URL, ad set name.
3. Choose a structure: one ad set per creative, all creatives in one ad set, or a matrix of creatives x audiences.

**Pipeline**
1. **Validate** before touching Meta: required fields, text length limits, aspect ratios, URL reachability, Page and Instagram permissions, budget sanity (hard cap the user sets).
2. **Preview**: show the full campaign tree, total daily budget, ad count, and warnings.
3. **Upload assets** directly to Meta (`adimages`, chunked `advideos`), storing the hash or video id. Videos are the slow, failure-prone part, so they get resumable, retried uploads.
4. **Create in order**: campaign, then ad sets, then creatives, then ads. Use Meta's batch requests (up to 50 operations per batch) to cut round trips **[verify]**.
5. **Everything is created PAUSED.** The user reviews it in the app, then activates with one click. This is your main safety feature.
6. **Idempotency**: store every returned Meta ID immediately, so a retry after a crash resumes and never duplicates.
7. **Chunking and rate limits**: process in small batches per function invocation, honour Meta's rate-limit headers, back off, and continue on the next cron tick.
8. **Undo**: delete or archive everything the job created, driven from the stored IDs.

**As built (2026-10-01, v1):** `launch-create` validates the request (pure logic in `_shared/launch.ts`, 13 unit tests) and runs a live Meta `validate_only` check, then stores a "ready" job for review. `launch-run` creates the campaign, ad sets, images, creatives and ads in small batches (4 ads per call); the web app calls it in a loop until done, so the browser tab must stay open for now (a cron-driven worker is the later upgrade). Meta ids are saved the moment each object exists, a lock prevents double runs, and billing, login and permission errors stop the job with a plain message. `launch-undo` deletes the campaign (which removes its ad sets and ads) and the creatives; uploaded images stay in the ad account library on purpose. Supported in v1: Traffic objective, image ads, one or many ad sets, URL parameters, accounts in 35 verified currencies (others are refused rather than guessed). Not yet built: reusable templates, CSV import, video, one-click activation (the user activates in Ads Manager), more objectives.

**Failure handling**: partial success is normal. Show which ads failed and why (translated from Meta's error codes into plain English), with a "retry failed only" button.

## 7. Meta approvals: start this in week 1, it is the critical path

This is the biggest schedule risk. Everything below is **[verify]** against Meta's current docs, because the process changes.

1. **Meta developer account and a Business Manager** (Business Portfolio). Free.
2. **Create the app** (Business type) and add the Marketing API.
3. **Development mode is NOT enough to create ads (found 2026-10-01).** It lets people with an app role log in and read data, but creating an ad creative fails with Meta error 100/1885183 ("Ads creative post was created by an app that is in development mode. It must be in public to create this ad."). Creatives create a Page post, and posts from a dev-mode app are refused. **The app must be switched to Live.** Live mode still limits permissions to people with a role on the app (Standard access) until App Review, so a private beta of trusted users can still work, but going Live needs a public privacy policy URL, terms URL, app icon, category and data-deletion instructions first. The earlier idea of running the whole pilot in development mode was wrong.
4. **To serve the public** you need App Review for `ads_management` (and `ads_read`, `business_management` if used), Business Verification, a live privacy policy and terms URL, a data-deletion callback, and screencast demos of each permission. Advanced or Standard access for the Marketing API has historically required a minimum volume of successful API calls with a low error rate over a rolling window. Your own beta usage helps satisfy this.
5. **Business Verification matches your documents against business registry records.** A person with no registration generally cannot pass it **[verify]**. The founder will not register a company. A cheaper sole-proprietorship registration in Pakistan may be enough documentation, but its cost and Meta's acceptance are unchecked, so treat it as an open question. **Do not pay for anything until we know whether it is needed.**

   **Why this may not block you at first:** the target is 5-10 pilot clients. Each can be given a role on your Meta app (tester or developer) and connect through it in development mode, so the whole pilot can run without App Review or Business Verification. Public self-serve signup is what needs them. Confirm the role limits and terms in Meta's docs before you promise this to clients.

   **Status of that assumption:** sources say a new app has Standard access, enough for ad accounts you own or admin, and that acting for third-party advertisers eventually needs Advanced access (App Review plus Business Verification). Meta renamed these tiers in May 2026 (now "Marketing API Access Tier"), so wording in old guides is stale. It is **not yet proven** that a client with an app role can authorize `ads_management` on their own ad account in development mode. Test it early: add one outside person as an app tester and see if they can connect their ad account.
6. Use OAuth (Facebook Login for Business), long-lived tokens, and a re-auth flow for expired tokens (they last about 60 days **[verify]**).

   **As built (2026-10-01):** the browser calls `meta-connect-start`, which returns a Facebook login URL carrying a signed, 10-minute `state` bound to the user, workspace and app origin. Facebook redirects back to the web app at `/meta/callback`, which sends the `code` to `meta-connect-complete`. That function checks the state belongs to the *same signed-in user* (this blocks login-CSRF, where an attacker tricks a victim into attaching the victim's ad accounts to the attacker's workspace), exchanges the code for a long-lived token, encrypts it (AES-256-GCM, bound to workspace and Facebook user), stores it with the ad accounts, and writes the audit log. The redirect goes to the web app, not to a public server endpoint, so nothing unauthenticated is exposed. Requested scopes: `ads_management`, `ads_read`, `business_management`, `pages_show_list`. Trim any that turn out to be unneeded before App Review.

Compliance must-haves regardless of stage: privacy policy, terms, data deletion endpoint, clear disclosure of what you store, and no scraping or unapproved data use.

## 8. Phases and rough timeline

Assumes focused part-time work (about 15-20 hours/week) with Claude Code doing most of the coding. Halve it for full time.

| Phase | Weeks | Deliverable | Exit test |
|---|---|---|---|
| 0. Validation and setup | 1 | 5-10 customer conversations. Domain, GitHub repo, Cloudflare, Supabase, Meta app and Business Manager created. Business Verification started. | You know the first customer and their top pain in their own words. |
| 1. Skeleton | 1-2 | Auth, workspaces, RLS, deploy pipeline, landing page with waitlist, privacy policy and terms. | A user signs up and sees an empty dashboard on your domain. |
| 2. Meta connection | 2-3 | OAuth connect, encrypted tokens, ad-account list, token refresh and expiry handling, read-only campaign view. | Your own account connects and lists campaigns. |
| 3. Launcher v1 | 3-6 | Templates, single-creative launch, then bulk and CSV, validation, preview, paused creation, audit log, retry and undo. | You launch 20 ads to your own test account in under 5 minutes, with zero duplicates. |
| 3b. UI polish pass | before the first demo | The screens are functional placeholders until the launcher works. Then one dedicated design pass: design tokens, consistent components, empty and error states, loading states, mobile layout, accessibility checks. | A stranger can complete a launch without help and the app looks credible in a screen recording. |
| 4. Private beta | 6-9 | 3-10 real users on dev-mode roles. Bug fixing, plain-English errors, onboarding. **First payments** through the payment link. | Users launch real campaigns without your help. Collect testimonials and screencasts. |
| 5. App Review | in parallel from week 3, decided by week 10-14 | Submitted app with demos, live policies, usage history. | Advanced access granted. |
| 6. Public launch | 10-14 | Billing, plan limits, public signup, help docs, launch posts. | 10 paying customers. |
| 7. Rules automation | 14+ | Pause and scale rules, budget guardrails, alerts by email. It reuses the connection, audit log and cron worker. | One rule saves a beta user real money. |

## 9. Pricing (starting point, test it)

- **Free**: 1 ad account, 10 ads/month. Lets people test and gives Meta reviewers a demo path.
- **Pro ~$39/month**: 3 ad accounts, 300 ads/month, templates, undo.
- **Agency ~$99/month**: 15 ad accounts, unlimited launches, team seats.

Pricing is on value delivered (hours saved), not on your cost. Your marginal cost per user is close to zero until the database outgrows the free tier.

## 10. Where Claude and the Pipeboard connector help

- **Claude Code**: writes the app, migrations, tests, and Edge Functions, and reviews security (tokens, RLS).
- **Pipeboard "Meta Ads" connector** (free tier, limited weekly executions **[verify]**): use it only for prototyping. Connected to your own ad account, it lets us test what a valid campaign, ad set and creative payload looks like, and read real insights, before writing the production code. **It is not part of the product**, because customers would hit its limits and pricing. The product calls Meta's API directly.
- Do not spend free-tier executions on things we can test locally.

## 11. Testing and safety

- Meta's API has no full sandbox, so use a dedicated **test ad account with a tiny spend cap and everything paused**.
- Unit-test the validators and payload builders with fixtures. Integration-test against the test account.
- Hard limits in code: max ads per job, max total daily budget per job, confirmation before activation.
- A row-level-security test suite (a user in workspace A must never read workspace B).
- Kill switch: a flag that stops all writes to Meta.

## 12. Main risks

| Risk | Impact | Mitigation |
|---|---|---|
| App Review delayed or rejected | Cannot go public | Start in week 1. Keep a private beta on dev-mode roles. Build a clean demo path. |
| Business Verification needs a registered company | Blocks public launch | Open question 2 below. Decide early. |
| Meta API changes or deprecations | Breakage | Pin a Graph API version, monitor the changelog, keep Meta calls in one module. |
| Bulk launch bug damages a customer's account or spend | Trust loss | Paused by default, budget caps, audit log, undo. |
| Supabase free-tier limits or pausing | Downtime | Cron keep-alive. Upgrade as soon as revenue covers it. |
| Ad accounts get restricted | Support burden | Explain Meta policy errors clearly. Never auto-retry policy rejections. |
| Competitors (Madgicx, Revealbot/Bïrch, AdEspresso, Pipeboard) | Crowded space | Win with narrow focus: fastest bulk launch for agencies, priced for small teams. |

## 13. Next actions (this week)

1. Answer the open questions below.
2. Confirm the Meta developer account and Business Manager, and create the app. Check Business Verification status. Do not start paid registration yet.
3. Start the outreach list and book customer conversations.
4. I scaffold the repo (Vite, TypeScript, Supabase, Cloudflare Pages) and the Supabase schema and RLS from section 5.
5. I use the Pipeboard connector, read-only, to look at your account and capture example payloads.

## Findings from live API tests (2026-10-01, founder's own ad account, via Pipeboard)

Account `act_1632137014446251`: active, PKR, Asia/Karachi, no spend, no campaigns, no pixel, one Page ("Digital Ventures"). Nothing was left behind: the test campaign, ad set, creative and image were created then deleted, and a re-read shows zero campaigns.

What the launcher's builders and validators must handle:
1. **Meta supports dry runs** on create calls (campaign, ad set, creative, ad). Use them as the pre-flight check in the "validate" step before any real write. A dry run is lighter than the live pass, so it does not guarantee success.
2. **Campaign with ad-set-level budgets** worked with OUTCOME_TRAFFIC, `PAUSED` and `special_ad_categories: []`.
3. **Ad set needs `bid_strategy` set explicitly** (e.g. `LOWEST_COST_WITHOUT_CAP`). Leaving it out failed with error 2490487 "bid amount or bid constraints required".
4. **Ad set that worked:** `optimization_goal=LINK_CLICKS`, `billing_event=IMPRESSIONS`, `destination_type=WEBSITE`, daily budget 30000 (minimum for this account was 27850), targeting `{geo_locations:{countries:[US]}, age_min:25, age_max:55}`.
5. **Image upload by URL** worked and returned an image hash. Creative with `page_id`, `image_hash`, `link_url`, message, headline and `LEARN_MORE` worked.
6. **Creating the ad failed: the ad account has no payment method** (error 1359188). The validator must check billing status and tell the user plainly, since "ads cannot be created until a payment method is added" is a blocker for every customer account. **Correction (2026-10-01):** the account's `funding_source` field is populated (id plus type only, no card description) even though ad creation still fails with 1359188, so the field is not a usable signal. The reliable check is a **dry-run ad creation** (`dry_run: true` on `create_ad`) against a paused ad set, and the app should record `has_payment_method = false` when it sees error 1359188. Until then the field is stored as unknown (null).
7. **Budget units:** values are in the currency's smallest unit ("cents"), and each account has its own minimum daily budget. Read `min_daily_budget` and `currency` per account, and never hard-code amounts.

Not yet tested: the final ad creation (blocked by billing), activation, video upload.

## Answered so far

- Based in Pakistan, selling to international customers. Stripe unavailable. Free platforms only.
- Will not register a company.
- Has a Meta developer account and Business Manager (still to confirm, see below).
- Believes contacting 100+ businesses and agencies would close 5-10 clients.

## Sales plan (founder-led, no ad spend)

- Build a list of 100+ target agencies and freelance media buyers (LinkedIn, Facebook groups, Reddit, X, agency directories).
- Personalised outreach (LinkedIn DMs and email). Lead with the pain (hours lost bulk-launching ads), not the product.
- Offer a **founding-client deal**: discounted price for feedback, in exchange for a testimonial and screencast.
- A 5-10% close rate on cold outreach is optimistic, so plan for 200+ contacts or warmer channels if replies are low.
- Start outreach in phase 0 to book conversations, and start selling when a demo works on a real account (around week 6).

## Open questions

1. **Meta status check.** Confirm at developers.facebook.com that the developer account is verified, and in Business Settings that the Business Manager exists and shows its verification status.
2. **Sole-proprietorship registration:** is that acceptable to you if it is the only route to Meta Business Verification? Its cost and Meta's acceptance are unchecked.
3. **Payoneer:** do you already have an account?
4. **Contact channels:** which do you have today (LinkedIn, an existing agency network, a Facebook group)?
