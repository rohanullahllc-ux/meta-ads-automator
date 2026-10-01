import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

const NAME = 'Ads Automator'
const EMAIL = 'venturesd081@gmail.com'
const UPDATED = 'October 1, 2026'

function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="shell">
      <header>
        <strong>{NAME}</strong>
        <nav className="legal-nav">
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/data-deletion">Data deletion</Link>
          <Link to="/guide">Guide</Link>
        </nav>
      </header>
      <main className="content legal">
        <h1>{title}</h1>
        <p className="muted">Last updated: {UPDATED}</p>
        {children}
        <p className="muted">Contact: <a href={`mailto:${EMAIL}`}>{EMAIL}</a></p>
      </main>
    </div>
  )
}

export function Privacy() {
  return (
    <Page title="Privacy Policy">
      <p>
        {NAME} ("we", "us") is a web application that helps people create and manage Meta (Facebook and Instagram)
        advertising campaigns. This policy explains what information we handle and why.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li><strong>Account information:</strong> your email address and a password (stored only as a secure hash by our authentication provider).</li>
        <li>
          <strong>Meta connection data</strong>, when you choose to connect a Meta account: your Facebook user ID and name,
          the list of ad accounts you can access (ID, name, currency, time zone, status and minimum budget), and an access
          token that Meta issues to us. The token is encrypted before it is stored.
        </li>
        <li>
          <strong>Campaign content you create in the app:</strong> campaign settings, ad copy, links, the images you upload,
          and the IDs of the campaigns, ad sets, creatives and ads we create in Meta on your behalf.
        </li>
        <li><strong>Activity records:</strong> a log of actions taken in your workspace, such as connecting an account or creating or undoing a launch.</li>
      </ul>

      <h2>How we use it</h2>
      <p>
        We use this information only to provide the service: to sign you in, to create, review and undo ads in the ad
        accounts you authorise, and to keep your workspace secure. We do not sell your information, we do not use it for
        our own advertising, and we do not build advertising profiles from it.
      </p>

      <h2>Permissions we request from Meta</h2>
      <ul>
        <li><code>ads_management</code> and <code>ads_read</code>: to create ads in, and read the ad accounts of, the account you connect.</li>
        <li><code>business_management</code>: to access ad accounts that belong to your business portfolio.</li>
        <li><code>pages_show_list</code>: to let you choose which Facebook Page your ads run from.</li>
      </ul>
      <p>We only use Meta data to provide these features, and we follow Meta's Platform Terms.</p>

      <h2>Who we share it with</h2>
      <p>
        We use service providers to run the app: Supabase (database, authentication and file storage) and Cloudflare
        (website hosting). They process data on our behalf. Information is also sent to Meta when you use the app to create ads.
        We do not share your information with anyone else unless the law requires it.
      </p>

      <h2>Security and retention</h2>
      <p>
        Meta access tokens are encrypted at rest and are never sent to your browser. Access to workspace data is restricted
        to the members of that workspace. We keep your data while your account is active. Images you upload are kept in private
        storage until you ask us to delete your data. You can revoke our access at any time in your Facebook settings under
        Business Integrations, and you can ask us to delete your data as described below.
      </p>

      <h2>Your choices and deletion</h2>
      <p>
        You can ask us to delete your account and all associated data at any time. See the{' '}
        <Link to="/data-deletion">data deletion instructions</Link>. We will respond within 30 days.
      </p>

      <h2>Changes</h2>
      <p>We may update this policy and will change the date above when we do.</p>
    </Page>
  )
}

export function Terms() {
  return (
    <Page title="Terms of Service">
      <p>By using {NAME} you agree to these terms.</p>

      <h2>The service</h2>
      <p>
        {NAME} helps you prepare and create advertising campaigns in Meta ad accounts that you are authorised to manage.
        Ads are created in a paused state. Nothing is activated or spends money through the app unless you activate it.
      </p>

      <h2>Your responsibilities</h2>
      <ul>
        <li>You must have the right to manage every ad account and Facebook Page you connect.</li>
        <li>You are responsible for your ad content, your targeting and your ad spend, and for complying with Meta's Advertising Standards and Platform Terms and all applicable laws.</li>
        <li>You must keep your login details secure and tell us if you think your account has been compromised.</li>
      </ul>

      <h2>Acceptable use</h2>
      <p>
        You may not use the service to create misleading, unlawful or prohibited ads, to attempt to access other users'
        data, or to interfere with the service.
      </p>

      <h2>No guarantees</h2>
      <p>
        The service depends on Meta's systems, which can change or fail. We do not guarantee that ads will be approved,
        delivered or perform in any particular way, and the service is provided "as is".
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the extent the law allows, we are not liable for indirect or consequential losses, or for advertising spend,
        lost revenue or account restrictions imposed by Meta. Our total liability is limited to the amount you paid us for
        the service in the 3 months before the claim.
      </p>

      <h2>Ending your use</h2>
      <p>
        You can stop using the service and request deletion of your data at any time. We may suspend access if these terms
        are broken or if Meta withdraws our access.
      </p>

      <h2>Changes</h2>
      <p>We may update these terms and will change the date above when we do. Continuing to use the service means you accept the update.</p>
    </Page>
  )
}

export function Guide() {
  return (
    <Page title="Getting started (private beta)">
      <p>
        {NAME} lets you create many Facebook and Instagram ads in one go. You upload your images, write the copy, and
        the app builds the campaign in your Meta ad account. <strong>Everything is created paused</strong>, so nothing
        spends money until you switch it on yourself.
      </p>

      <h2>Before you start</h2>
      <ul>
        <li>Admin access to your ad account in Meta Business Suite, so you can share it with us.</li>
        <li>A Facebook Page you manage, for the ads to run from.</li>
        <li>A working payment method on the ad account. Meta will not create ads without one.</li>
      </ul>

      <h2>Step 1: Sign in</h2>
      <p>
        We create your account and send you a temporary password. Sign in at the address we gave you, then open
        <strong> Account</strong> and change the password.
      </p>

      <h2>Step 2: Share your ad account and Page with us</h2>
      <p>You do this once, in Meta Business Suite. You never log in to Facebook through our app.</p>
      <ol>
        <li>Open <strong>Business settings</strong> in Meta Business Suite and choose <strong>Partners</strong>.</li>
        <li>Click <strong>Add</strong>, then <strong>Give a partner access to your assets</strong>.</li>
        <li>Enter our Business ID: <strong>1808077727046655</strong> (business name: Digital Ventures).</li>
        <li>Choose your <strong>ad account</strong> and your <strong>Facebook Page</strong> and give full control.</li>
        <li>Send us your ad account ID (it looks like <em>act_1234567890</em>, shown in Ads Manager).</li>
      </ol>

      <h2>Step 3: We link it</h2>
      <p>
        We accept the share and link the ad account to your workspace. It then appears on your dashboard, usually
        within a few hours. You can revoke our access at any time from the same Partners screen.
      </p>

      <h2>Step 4: Create your first launch</h2>
      <ol>
        <li>Click <strong>New launch</strong>.</li>
        <li>Choose the ad account and Page, name the campaign, set a daily budget and the countries.</li>
        <li>Add your ads: an image, headline, text and link for each.</li>
        <li>Click <strong>Review launch</strong>. Check the summary.</li>
        <li>Click <strong>Create in Meta (paused)</strong>.</li>
      </ol>
      <p>
        Then open the campaign in Meta Ads Manager, check it, and switch it on there when you are ready. Changed your mind?
        Press <strong>Undo launch</strong> and everything the launch created is removed.
      </p>

      <h2>If something goes wrong</h2>
      <ul>
        <li>
          <strong>"No usable payment method":</strong> add a payment method to the ad account in Meta Ads Manager under
          billing settings, then press <strong>Retry failed ads</strong>.
        </li>
        <li><strong>"The Meta connection has expired":</strong> tell us and we will renew it.</li>
        <li><strong>Anything else:</strong> copy the message you see and email us. We will help.</li>
      </ul>

      <h2>Your data</h2>
      <p>
        We only use your Meta access to create the ads you ask for. You can remove our access in Facebook at any time and
        ask us to delete your data. See the <Link to="/data-deletion">data deletion instructions</Link> and our{' '}
        <Link to="/privacy">privacy policy</Link>.
      </p>
    </Page>
  )
}

export function DataDeletion() {
  return (
    <Page title="Data Deletion Instructions">
      <p>You can have your {NAME} data deleted at any time. There are two steps.</p>

      <h2>1. Remove our access in Facebook</h2>
      <ol>
        <li>Open Facebook and go to Settings, then Business Integrations (or Apps and Websites).</li>
        <li>Find "{NAME}" and choose Remove.</li>
      </ol>
      <p>This stops us from using your Meta access token straight away.</p>

      <h2>2. Ask us to delete your data</h2>
      <p>
        Email <a href={`mailto:${EMAIL}`}>{EMAIL}</a> from the address you signed up with, with the subject
        "Delete my data". We will delete your account, workspace, stored Meta connection (including the encrypted token),
        uploaded images and launch records within 30 days, and confirm by email.
      </p>
      <p>
        Deleting your data in {NAME} does not delete campaigns, ads or other objects that were already created in your
        Meta ad accounts. You can remove those in Meta Ads Manager, or use the "Undo launch" button in the app before you
        ask for deletion.
      </p>
    </Page>
  )
}
