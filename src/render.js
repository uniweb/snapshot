/**
 * Render: rasterize a composition document with the browser, then encode it.
 *
 * The document is served from memory on a made-up origin, so there is no
 * temporary directory and nothing can load from anywhere else by accident.
 * It is always rasterized at twice the canvas size and resampled down, which
 * keeps downscaled captures and text crisp.
 */

import sharp from 'sharp'

const ORIGIN = 'http://snapshot.local'
const RASTER_SCALE = 2

export const FORMATS = ['webp', 'png', 'jpeg', 'avif']

/** `.webp` → `webp`, `.jpg` → `jpeg`; null for anything else. */
export function formatFromPath(path) {
  const ext = String(path ?? '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]
  if (ext === 'jpg') return 'jpeg'
  return FORMATS.includes(ext) ? ext : null
}

function encode(image, format, quality) {
  switch (format) {
    case 'png':
      return image.png({ compressionLevel: 9 })
    case 'jpeg':
      return image.jpeg({ quality, mozjpeg: true })
    case 'avif':
      return image.avif({ quality })
    case 'webp':
      return image.webp({ quality, effort: 5 })
    default:
      throw new Error(`Unsupported image format: ${format} (use ${FORMATS.join(', ')})`)
  }
}

/**
 * @param {import('playwright-core').Browser} browser
 * @param {object} input
 * @param {string} input.html - the composition document
 * @param {Record<string, Buffer>} [input.assets] - files it references by name (PNG captures)
 * @param {{ width: number, height: number }} input.canvas
 * @param {number} [input.scale] - output pixels per canvas pixel (1 or 2)
 * @param {string} [input.format]
 * @param {number} [input.quality]
 * @returns {Promise<{ buffer: Buffer, width: number, height: number, format: string }>}
 */
export async function renderComposition(browser, { html, assets = {}, canvas, scale = 1, format = 'webp', quality = 82 }) {
  const context = await browser.newContext({
    viewport: { width: canvas.width, height: canvas.height },
    deviceScaleFactor: RASTER_SCALE,
  })
  try {
    const page = await context.newPage()
    await page.route(`${ORIGIN}/**`, (route) => {
      const name = decodeURIComponent(new URL(route.request().url()).pathname.slice(1))
      if (name === '') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: html })
      const body = assets[name]
      return body ? route.fulfill({ contentType: 'image/png', body }) : route.fulfill({ status: 404 })
    })
    await page.goto(`${ORIGIN}/`, { waitUntil: 'load' })
    await page.evaluate(() => Promise.all([...document.images].map((img) => img.decode().catch(() => {}))))
    const png = await page.screenshot({ type: 'png' })

    const width = Math.round(canvas.width * scale)
    const height = Math.round(canvas.height * scale)
    let image = sharp(png)
    if (scale !== RASTER_SCALE) image = image.resize(width, height, { kernel: 'lanczos3' })
    const { data, info } = await encode(image, format, quality).toBuffer({ resolveWithObject: true })
    return { buffer: data, width: info.width, height: info.height, format }
  } finally {
    await context.close()
  }
}

/** Mean relative luminance (0–1) of an image — how light a capture reads. */
export async function meanLuminance(buffer) {
  const { channels } = await sharp(buffer).stats()
  const [r, g, b] = channels
  return (0.2126 * r.mean + 0.7152 * g.mean + 0.0722 * b.mean) / 255
}
