/**
 * What every layout shares: the canvas, its unit, and the frames a capture sits in.
 *
 * Layouts are pure — measurements in, geometry and HTML out — with no Node or
 * browser imports, so they can run, and be tested, anywhere.
 */

/** The viewport the desktop capture is taken at (`capture.js` DESKTOP). */
export const DESKTOP_VIEWPORT = { width: 1440, height: 900 }

/** The viewport the phone capture is taken at (`capture.js` MOBILE). */
export const MOBILE_VIEWPORT = { width: 390, height: 844 }

/** The default image: 16:10. */
export const DEFAULT_CANVAS = { width: 1600, height: 1000 }

/** Every length below is designed at 1600×1000 and scales by this. */
export const unitOf = (canvas) => Math.min(canvas.width / 1600, canvas.height / 1000)

const px = (value) => `${Math.round(value * 100) / 100}px`

/** The browser window and phone frames, at scale `k`. */
export function frameCss(k) {
  return `
  .window { position:absolute; overflow:hidden; background:#fff; border-radius:${px(14 * k)};
            box-shadow: 0 ${px(40 * k)} ${px(90 * k)} ${px(-30 * k)} rgb(15 23 42 / .45),
                        0 ${px(12 * k)} ${px(30 * k)} ${px(-12 * k)} rgb(15 23 42 / .25),
                        0 0 0 1px rgb(15 23 42 / .08); }
  .bar { display:flex; align-items:center; gap:${px(7 * k)}; padding:0 ${px(13 * k)}; box-sizing:border-box;
         background:#f1f3f6; border-bottom:1px solid rgb(15 23 42 / .07); }
  .bar i { display:block; width:${px(10 * k)}; height:${px(10 * k)}; border-radius:50%; background:#d4d8de; }
  .shot { display:block; width:100%; height:auto; }
  .strip { position:absolute; overflow:hidden; background:#fff; border-radius:${px(12 * k)};
           box-shadow: 0 ${px(50 * k)} ${px(100 * k)} ${px(-30 * k)} rgb(15 23 42 / .55),
                       0 0 0 1px rgb(15 23 42 / .08); }
  .phone { position:absolute; box-sizing:border-box; background:#0b0d12;
           box-shadow: 0 ${px(50 * k)} ${px(90 * k)} ${px(-25 * k)} rgb(15 23 42 / .6), inset 0 0 0 ${px(2 * k)} #2a2f3a; }
  .screen { overflow:hidden; background:#fff; }`
}

/** A complete composition document, sized to the canvas. */
export function documentHtml({ canvas, background, css, body }) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin:0; }
  body { position:relative; overflow:hidden; width:${canvas.width}px; height:${canvas.height}px; background:${background}; }
  ${css}
</style></head><body>${body}</body></html>`
}

/** A browser window around a capture — with a title bar, or plain when `bar` is 0. */
export function windowHtml({ left, top, width, bar }, src) {
  const titleBar = bar ? `<div class="bar" style="height:${bar}px"><i></i><i></i><i></i></div>` : ''
  return `<div class="window" style="left:${left}px;top:${top}px;width:${width}px">
    ${titleBar}<img class="shot" src="${src}" alt="">
  </div>`
}
