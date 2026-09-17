/**
 * The layouts, the look options they share, and the two automatic choices:
 * which layout, and which tone.
 */

export { DEFAULT_CANVAS } from './shared.js'
export { TONES, backgroundCss } from './background.js'
export { FRAMES, LOOK_DEFAULTS, SIDES, parseStrip, resolveLook } from './options.js'
export { splitGeometry, splitHtml } from './split.js'
export { deviceGeometry, deviceHtml } from './device.js'

export const LAYOUTS = ['split', 'device']

/**
 * A page at least this many viewports tall scrolls as a page, and gets `split`.
 * Anything shorter — including a site whose document never scrolls because an
 * inner panel does — gets `device`.
 */
export const SCROLL_RATIO = 1.6

/**
 * @param {{ scrollHeight: number, viewport: { height: number } }} measurements
 * @returns {'split'|'device'}
 */
export function chooseLayout({ scrollHeight, viewport }) {
  return scrollHeight / viewport.height >= SCROLL_RATIO ? 'split' : 'device'
}

/** Mean relative luminance above which a page reads as light. */
const LIGHT_PAGE = 0.55

/**
 * A light page stands out on a deep background, and a dark one on a light
 * background.
 *
 * @param {number} luminance - mean relative luminance of the first view, 0–1
 * @returns {'light'|'deep'}
 */
export function toneFor(luminance) {
  return luminance > LIGHT_PAGE ? 'deep' : 'light'
}
