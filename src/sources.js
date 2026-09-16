/**
 * Where a capture comes from. A snapshot always photographs a URL; these two
 * helpers put a local site behind one.
 *
 *   serveDirectory — a built site (`dist/`), on a loopback port. What a visitor
 *                    gets, and the fastest to capture.
 *   startDevServer — the site's own Vite dev server, in this process. No build
 *                    step, and it reflects edits as they are saved.
 *
 * Anything already running — a dev server in another terminal, a deployed site —
 * needs neither: pass its URL straight to `snapshot()`.
 */

import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
  '.wasm': 'application/wasm',
}

/** `docs` → `/docs/`; `/` → `/`. */
export function normalizeBase(base = '/') {
  const trimmed = String(base).trim().replace(/^\/+|\/+$/g, '')
  return trimmed ? `/${trimmed}/` : '/'
}

async function isFile(path) {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

/**
 * The file that answers `path` inside `root`, or null.
 *
 * The file itself, then a page: `<route>/index.html`, then `<route>.html`. After
 * that, a missing ASSET — a path whose extension is a static file type — is a
 * 404: answering it with the HTML shell would hand a script tag an HTML document.
 * Anything else is a route the client renders, answered with the root
 * `index.html`. A dot alone does not make a file: `/releases/1.2` is a route.
 */
export async function resolveRequestFile(root, path) {
  const dir = resolve(root)
  const target = normalize(join(dir, path))
  if (target !== dir && !target.startsWith(dir + sep)) return null
  for (const candidate of [target, join(target, 'index.html'), `${target}.html`]) {
    if (await isFile(candidate)) return candidate
  }
  if (CONTENT_TYPES[extname(path).toLowerCase()]) return null
  const shell = join(dir, 'index.html')
  return (await isFile(shell)) ? shell : null
}

/**
 * Serve a built site directory on 127.0.0.1, on a free port.
 *
 * @param {string} root - the build output, e.g. `site/dist`
 * @param {{ base?: string }} [options] - the site's base path, when it is built under one
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
export async function serveDirectory(root, { base = '/' } = {}) {
  const prefix = normalizeBase(base)
  const server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
      const inside = pathname.startsWith(prefix) || `${pathname}/` === prefix
      const file = inside ? await resolveRequestFile(root, `/${pathname.slice(prefix.length)}`) : null
      if (!file) {
        res.writeHead(404).end()
        return
      }
      res.writeHead(200, {
        'content-type': CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
      })
      res.end(await readFile(file))
    } catch {
      res.writeHead(500).end()
    }
  })

  await new Promise((ready, fail) => {
    server.once('error', fail)
    server.listen(0, '127.0.0.1', ready)
  })
  const { port } = server.address()

  return {
    url: `http://127.0.0.1:${port}${prefix}`,
    close: () =>
      new Promise((done) => {
        // A browser keeps connections alive; without this, close waits on them.
        server.closeAllConnections?.()
        server.close(() => done())
      }),
  }
}

/**
 * Start the site's own Vite dev server in this process, on a free loopback port.
 *
 * Vite is resolved from the site, so the version the site declares is the one
 * that runs.
 *
 * ⚠️ Changes the working directory to `siteRoot` until `close()`: a Uniweb site's
 * Vite config locates the site from the working directory. One dev server per
 * process, therefore.
 *
 * @param {string} siteRoot
 * @returns {Promise<{ url: string, server: object, close: () => Promise<void> }>}
 */
export async function startDevServer(siteRoot) {
  const root = resolve(siteRoot)
  let vitePath
  try {
    vitePath = createRequire(join(root, 'package.json')).resolve('vite')
  } catch {
    throw new Error(`Vite is not installed for ${root}. Install the site's dependencies first.`)
  }
  const vite = await import(pathToFileURL(vitePath).href)

  const previousCwd = process.cwd()
  process.chdir(root)
  let server
  try {
    server = await vite.createServer({
      root,
      logLevel: 'warn',
      clearScreen: false,
      server: { host: '127.0.0.1', port: 0 },
    })
    await server.listen()
  } catch (err) {
    await server?.close().catch(() => {})
    process.chdir(previousCwd)
    throw err
  }

  const url = server.resolvedUrls?.local?.[0]
  if (!url) {
    await server.close()
    process.chdir(previousCwd)
    throw new Error('The dev server started but reported no local URL.')
  }

  return {
    url,
    server,
    close: async () => {
      await server.close()
      process.chdir(previousCwd)
    },
  }
}
