import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { normalizeBase, resolveRequestFile, serveDirectory, targetUrl } from '../src/sources.js'
import { formatFromPath } from '../src/render.js'

let dist

beforeAll(async () => {
  dist = await mkdtemp(join(tmpdir(), 'snapshot-dist-'))
  await writeFile(join(dist, 'index.html'), '<p>home</p>')
  await mkdir(join(dist, 'features'))
  await writeFile(join(dist, 'features', 'index.html'), '<p>features</p>')
  await writeFile(join(dist, 'pricing.html'), '<p>pricing</p>')
  await mkdir(join(dist, 'assets'))
  await writeFile(join(dist, 'assets', 'app.js'), 'export {}')
  await mkdir(join(dist, 'releases', '1.2'), { recursive: true })
  await writeFile(join(dist, 'releases', '1.2', 'index.html'), '<p>release 1.2</p>')
})

afterAll(async () => {
  await rm(dist, { recursive: true, force: true })
})

describe('normalizeBase', () => {
  it('always has a leading and a trailing slash', () => {
    expect(normalizeBase()).toBe('/')
    expect(normalizeBase('/')).toBe('/')
    expect(normalizeBase('docs')).toBe('/docs/')
    expect(normalizeBase('/docs/v2/')).toBe('/docs/v2/')
  })
})

describe('resolveRequestFile', () => {
  it('answers routes with their prerendered page, then the shell', async () => {
    expect(await resolveRequestFile(dist, '/')).toBe(join(dist, 'index.html'))
    expect(await resolveRequestFile(dist, '/features')).toBe(join(dist, 'features', 'index.html'))
    expect(await resolveRequestFile(dist, '/pricing')).toBe(join(dist, 'pricing.html'))
    expect(await resolveRequestFile(dist, '/blog/some-post')).toBe(join(dist, 'index.html'))
  })

  it('never answers a missing file with the shell', async () => {
    expect(await resolveRequestFile(dist, '/assets/app.js')).toBe(join(dist, 'assets', 'app.js'))
    expect(await resolveRequestFile(dist, '/assets/missing.js')).toBeNull()
    expect(await resolveRequestFile(dist, '/missing.webp')).toBeNull()
  })

  it('does not take a dot in a route for a file extension', async () => {
    expect(await resolveRequestFile(dist, '/releases/1.2')).toBe(join(dist, 'releases', '1.2', 'index.html'))
    expect(await resolveRequestFile(dist, '/releases/1.3')).toBe(join(dist, 'index.html'))
  })

  it('stays inside the directory', async () => {
    await writeFile(join(dist, '..', 'outside.txt'), 'secret')
    try {
      expect(await resolveRequestFile(dist, '/../outside.txt')).toBeNull()
      expect(await resolveRequestFile(dist, '/../../etc/passwd')).toBeNull()
    } finally {
      await rm(join(dist, '..', 'outside.txt'), { force: true })
    }
  })
})

describe('serveDirectory', () => {
  it('serves a site at the root', async () => {
    const server = await serveDirectory(dist)
    try {
      expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/)
      const home = await fetch(server.url)
      expect(home.status).toBe(200)
      expect(home.headers.get('content-type')).toContain('text/html')
      expect(await home.text()).toBe('<p>home</p>')
      expect(await (await fetch(`${server.url}features`)).text()).toBe('<p>features</p>')
      const script = await fetch(`${server.url}assets/app.js`)
      expect(script.headers.get('content-type')).toContain('javascript')
      expect((await fetch(`${server.url}assets/missing.js`)).status).toBe(404)
    } finally {
      await server.close()
    }
  })

  it('serves a site built under a base path, and nothing outside it', async () => {
    const server = await serveDirectory(dist, { base: '/docs/' })
    try {
      expect(server.url).toMatch(/\/docs\/$/)
      expect(await (await fetch(`${server.url}features`)).text()).toBe('<p>features</p>')
      expect((await fetch(new URL('/features', server.url))).status).toBe(404)
    } finally {
      await server.close()
    }
  })
})

describe('formatFromPath', () => {
  it('reads the format from the extension', () => {
    expect(formatFromPath('public/preview.webp')).toBe('webp')
    expect(formatFromPath('card.JPG')).toBe('jpeg')
    expect(formatFromPath('card.avif')).toBe('avif')
    expect(formatFromPath('card.gif')).toBeNull()
    expect(formatFromPath(undefined)).toBeNull()
  })
})

describe('targetUrl', () => {
  it('leaves the URL alone without a route', () => {
    expect(targetUrl('https://example.com/some/page')).toBe('https://example.com/some/page')
    expect(targetUrl('https://example.com/some/page', '/')).toBe('https://example.com/some/page')
  })

  it('resolves a route under the URL, base path included', () => {
    expect(targetUrl('http://127.0.0.1:4000/', '/features')).toBe('http://127.0.0.1:4000/features')
    expect(targetUrl('http://127.0.0.1:4000/docs/', '/guide/intro')).toBe('http://127.0.0.1:4000/docs/guide/intro')
    expect(targetUrl('http://127.0.0.1:4000/docs', 'guide')).toBe('http://127.0.0.1:4000/docs/guide')
  })
})
