// Runs after `vite build` and the SSR build. Writes dist/privacy.html, dist/terms.html and
// dist/data-deletion.html with the page content already in the HTML. Cloudflare serves these at
// /privacy, /terms and /data-deletion with no redirect.
import { readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const root = path.resolve(import.meta.dirname, '..')
const { pages, renderPage } = await import(pathToFileURL(path.join(root, 'dist-ssr', 'prerender.js')).href)

const template = await readFile(path.join(root, 'dist', 'index.html'), 'utf8')
const marker = '<div id="root"></div>'
if (!template.includes(marker) || !/<title>.*?<\/title>/.test(template)) {
  throw new Error('dist/index.html does not have the expected root element and title.')
}

for (const [name, page] of Object.entries(pages)) {
  const html = template
    .replace(marker, `<div id="root">${renderPage(name)}</div>`)
    .replace(/<title>.*?<\/title>/, `<title>${page.title}</title>`)
  await writeFile(path.join(root, 'dist', `${name}.html`), html)
  console.log(`prerendered /${name}`)
}

await rm(path.join(root, 'dist-ssr'), { recursive: true, force: true })
