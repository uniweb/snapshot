/**
 * Every choice about the image, checked in one place before anything is opened.
 */

import { DEFAULT_CANVAS, LAYOUTS, TONES, resolveLook } from './layouts/index.js'
import { FORMATS, formatFromPath } from './render.js'

export const CANVAS_LIMITS = { width: [320, 4096], height: [200, 4096] }

const fail = (message) => {
  const error = new Error(message)
  error.code = 'SNAPSHOT_OPTION'
  return error
}

const within = (value, [min, max]) => Number.isInteger(value) && value >= min && value <= max

/**
 * @param {object} [options] - see `snapshot()`
 * @returns {{ layout: string, tone: string, look: object, canvas: { width: number, height: number },
 *             scale: number, format: string, quality: number, hide: string[], output?: string }}
 */
export function normalizeOptions(options = {}) {
  const {
    layout = 'auto',
    tone = 'auto',
    canvas = DEFAULT_CANVAS,
    scale = 1,
    output,
    quality = 82,
    hide = [],
    gap,
    overlap,
    strip,
    side,
    frame,
  } = options

  if (layout !== 'auto' && !LAYOUTS.includes(layout)) {
    throw fail(`Unknown layout "${layout}" (use auto, ${LAYOUTS.join(', ')})`)
  }
  if (tone !== 'auto' && !TONES.includes(tone)) {
    throw fail(`Unknown tone "${tone}" (use auto, ${TONES.join(', ')})`)
  }
  if (output !== undefined && output !== null && !formatFromPath(output)) {
    throw fail(`Cannot tell the image format from "${output}" (use .webp, .png, .jpg or .avif)`)
  }
  const format = options.format ?? formatFromPath(output) ?? 'webp'
  if (!FORMATS.includes(format)) throw fail(`Unknown format "${format}" (use ${FORMATS.join(', ')})`)
  if (!within(canvas?.width, CANVAS_LIMITS.width) || !within(canvas?.height, CANVAS_LIMITS.height)) {
    throw fail('The canvas is 320–4096 pixels wide and 200–4096 tall.')
  }
  if (scale !== 1 && scale !== 2) throw fail('scale is 1 or 2.')
  if (!within(quality, [1, 100])) throw fail('quality is a whole number from 1 to 100.')
  if (!Array.isArray(hide) || hide.some((selector) => typeof selector !== 'string' || !selector.trim())) {
    throw fail('hide is a list of CSS selectors.')
  }

  // The look is checked against every layout it could be drawn with.
  const look = { gap, overlap, strip, side, frame }
  for (const name of layout === 'auto' ? LAYOUTS : [layout]) resolveLook(name, look)

  return { layout, tone, look, canvas: { width: canvas.width, height: canvas.height }, scale, format, quality, hide, output }
}
