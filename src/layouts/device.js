/**
 * device — the page in a desktop browser window, with a phone showing the same
 * page in front of it.
 *
 * For a site whose document does not scroll as one long page — a documentation
 * site's fixed shell, an app — where a long strip would only repeat the viewport.
 */

import {
  DEFAULT_CANVAS,
  DESKTOP_VIEWPORT,
  MOBILE_VIEWPORT,
  documentHtml,
  frameCss,
  unitOf,
  windowHtml,
} from './shared.js'

/**
 * @param {object} [input]
 * @param {{ width: number, height: number }} [input.canvas]
 * @param {{ width: number, height: number }} [input.viewport] - the desktop viewport
 * @param {{ width: number, height: number }} [input.mobile] - the phone viewport
 */
export function deviceGeometry({ canvas = DEFAULT_CANVAS, viewport = DESKTOP_VIEWPORT, mobile = MOBILE_VIEWPORT } = {}) {
  const { width: W, height: H } = canvas
  const k = unitOf(canvas)
  const margin = Math.round(64 * k)
  const bar = Math.round(30 * k)

  // Scaled by the unit, not by the height alone: a tall, narrow canvas would
  // otherwise get a phone wider than itself.
  const screenHeight = Math.round(628 * k)
  const screenWidth = Math.round((screenHeight * mobile.width) / mobile.height)
  const bezel = Math.round((11 * screenWidth) / 290)
  const phone = {
    width: screenWidth + 2 * bezel,
    height: screenHeight + 2 * bezel,
    bezel,
    radius: Math.round(screenWidth * 0.166),
    screen: { width: screenWidth, height: screenHeight, radius: Math.round(screenWidth * 0.131) },
  }

  let windowWidth = Math.round(W * 0.744)
  let windowHeight = Math.round((windowWidth * viewport.height) / viewport.width) + bar
  if (windowHeight > H - 2 * margin) {
    windowHeight = H - 2 * margin
    windowWidth = Math.round(((windowHeight - bar) * viewport.width) / viewport.height)
  }
  const window = {
    left: margin,
    top: Math.max(margin, Math.round((H - windowHeight) / 2 - 30 * k)),
    width: windowWidth,
    height: windowHeight,
    bar,
  }

  // The phone overlaps the window's right edge, and never leaves the canvas.
  phone.left = Math.min(W - margin - phone.width, window.left + window.width - Math.round(phone.width * 0.1))
  phone.top = H - phone.height - Math.round(48 * k)

  // Centre the pair horizontally.
  const groupRight = Math.max(window.left + window.width, phone.left + phone.width)
  const shift = Math.round((W - (groupRight - window.left)) / 2) - window.left
  window.left += shift
  phone.left += shift

  return { canvas: { width: W, height: H }, k, window, phone }
}

/**
 * @param {object} input
 * @param {ReturnType<typeof deviceGeometry>} input.geometry
 * @param {string} input.background - CSS background
 * @param {string} [input.desktop] - URL of the desktop viewport capture
 * @param {string} [input.mobile] - URL of the phone viewport capture
 */
export function deviceHtml({ geometry, background, desktop = 'desktop.png', mobile = 'mobile.png' }) {
  const { canvas, k, window, phone } = geometry
  return documentHtml({
    canvas,
    background,
    css: frameCss(k),
    body: `
  ${windowHtml(window, desktop)}
  <div class="phone" style="left:${phone.left}px;top:${phone.top}px;width:${phone.width}px;height:${phone.height}px;padding:${phone.bezel}px;border-radius:${phone.radius}px">
    <div class="screen" style="width:${phone.screen.width}px;height:${phone.screen.height}px;border-radius:${phone.screen.radius}px">
      <img class="shot" src="${mobile}" alt="">
    </div>
  </div>`,
  })
}
