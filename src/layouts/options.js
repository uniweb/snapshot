/**
 * The look of a layout: how the two frames sit together. Pure, like the layouts.
 *
 *   gap / overlap — the space between the frames, or how far they overlap, in
 *                   pixels at 1600×1000 (scaled with the canvas). One or the other.
 *   strip         — split only: `fit` (the strip is as wide as makes the whole page
 *                   span the canvas, within limits) or `1:N` (one wide for N tall).
 *   side          — which side the strip (split) or the phone (device) is on.
 *   frame         — `browser` (a window with a title bar) or `plain`.
 */

export const SIDES = ['right', 'left']
export const FRAMES = ['browser', 'plain']

/** Limits, in pixels at 1600×1000. */
export const MAX_SPACING = 400
export const MAX_STRIP_RATIO = 8

/** What each layout looks like when nothing is chosen. */
export const LOOK_DEFAULTS = {
  split: { gap: 48, strip: 'fit', side: 'right', frame: 'browser' },
  device: { overlap: 31, side: 'right', frame: 'browser' },
}

const fail = (message) => {
  const error = new Error(message)
  error.code = 'SNAPSHOT_OPTION'
  return error
}

/**
 * `fit`, `1:N` or N → `'fit'` or the number N.
 * @param {unknown} value
 * @returns {'fit'|number}
 */
export function parseStrip(value) {
  if (value === undefined || value === null || value === 'fit') return 'fit'
  const text = String(value).trim()
  const match = /^(?:1:)?(\d+(?:\.\d+)?)$/.exec(text)
  const ratio = match ? Number(match[1]) : NaN
  if (!(ratio >= 1 && ratio <= MAX_STRIP_RATIO)) {
    throw fail(`strip is \`fit\` or 1:N with N from 1 to ${MAX_STRIP_RATIO} (got "${text}")`)
  }
  return ratio
}

function spacingValue(name, value) {
  const number = Number(value)
  if (value === '' || value === null || !Number.isFinite(number) || number < 0 || number > MAX_SPACING) {
    throw fail(`${name} is a number of pixels from 0 to ${MAX_SPACING} (got "${value}")`)
  }
  return number
}

/**
 * The look a layout is drawn with: the layout's defaults, then what was chosen.
 *
 * @param {'split'|'device'} layout
 * @param {{ gap?: number, overlap?: number, strip?: string|number, side?: string, frame?: string }} [chosen]
 * @returns {{ spacing: number, strip: 'fit'|number, side: string, frame: string }}
 *   `spacing` is signed: positive is a gap, negative an overlap.
 */
export function resolveLook(layout, chosen = {}) {
  const defaults = LOOK_DEFAULTS[layout]
  if (!defaults) throw fail(`Unknown layout "${layout}"`)
  const has = (key) => chosen[key] !== undefined && chosen[key] !== null
  if (has('gap') && has('overlap')) throw fail('Choose gap or overlap, not both.')

  let spacing
  if (has('gap')) spacing = spacingValue('gap', chosen.gap)
  else if (has('overlap')) spacing = -spacingValue('overlap', chosen.overlap)
  else spacing = defaults.gap !== undefined ? defaults.gap : -defaults.overlap

  const side = has('side') ? chosen.side : defaults.side
  if (!SIDES.includes(side)) throw fail(`Unknown side "${side}" (use ${SIDES.join(', ')})`)
  const frame = has('frame') ? chosen.frame : defaults.frame
  if (!FRAMES.includes(frame)) throw fail(`Unknown frame "${frame}" (use ${FRAMES.join(', ')})`)

  return { spacing, strip: parseStrip(has('strip') ? chosen.strip : defaults.strip), side, frame }
}
