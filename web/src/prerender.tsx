// Used only at build time (see scripts/prerender.mjs) to turn the public legal pages into static HTML,
// so crawlers and reviewers that do not run JavaScript still see the full text.
import type { ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import { DataDeletion, Privacy, Terms } from './pages/Legal'

export const pages: Record<string, { title: string; element: ReactElement }> = {
  privacy: { title: 'Privacy Policy - Ads Automator', element: <Privacy /> },
  terms: { title: 'Terms of Service - Ads Automator', element: <Terms /> },
  'data-deletion': { title: 'Data Deletion Instructions - Ads Automator', element: <DataDeletion /> },
}

export function renderPage(name: string): string {
  return renderToString(<StaticRouter location={`/${name}`}>{pages[name].element}</StaticRouter>)
}
