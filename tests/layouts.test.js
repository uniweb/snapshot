import { describe, expect, it } from 'vitest'

import {
  LOOK_DEFAULTS,
  SCROLL_RATIO,
  backgroundCss,
  chooseLayout,
  deviceGeometry,
  deviceHtml,
  parseStrip,
  resolveLook,
  splitGeometry,
  splitHtml,
  toneFor,
} from '../src/layouts/index.js'
import { safeColor } from '../src/layouts/background.js'

// The default, a social card, and the extremes `--size` accepts: wide and short,
// tall and narrow. Every layout must stay on every one of them.
const CANVASES = [
  { width: 1600, height: 1000 },
  { width: 1200, height: 630 },
  { width: 1600, height: 630 },
  { width: 1500, height: 500 },
  { width: 1920, height: 1080 },
  { width: 1000, height: 1000 },
  { width: 800, height: 1200 },
  { width: 4096, height: 200 },
  { width: 320, height: 4096 },
  { width: 320, height: 200 },
]

// Looks at their extremes, as `resolveLook` would hand them to a geometry.
const LOOKS = [
  {},
  { spacing: -70 },
  { spacing: 400 },
  { spacing: -400 },
  { strip: 1 },
  { strip: 8 },
  { side: 'left' },
  { side: 'left', spacing: -70, frame: 'plain' },
]

const inside = (box, canvas) =>
  box.left >= 0 && box.left + box.width <= canvas.width && box.top >= 0 && box.top + box.height <= canvas.height

/** The two frames, left to right, and the space between them (negative when they overlap). */
function pair(a, b) {
  const [first, second] = a.left <= b.left ? [a, b] : [b, a]
  return { left: first.left, right: second.left + second.width, between: second.left - (first.left + first.width) }
}

describe('chooseLayout', () => {
  const viewport = { width: 1440, height: 900 }

  it('gives a page that scrolls the split layout', () => {
    expect(chooseLayout({ scrollHeight: 2348, viewport })).toBe('split')
    expect(chooseLayout({ scrollHeight: 900 * SCROLL_RATIO, viewport })).toBe('split')
  })

  it('gives a page that does not scroll as a page the device layout', () => {
    // A docs shell: the document is exactly one viewport tall, an inner panel scrolls.
    expect(chooseLayout({ scrollHeight: 900, viewport })).toBe('device')
    expect(chooseLayout({ scrollHeight: 900 * SCROLL_RATIO - 1, viewport })).toBe('device')
  })
})

describe('toneFor', () => {
  it('puts a light page on a deep background and a dark page on a light one', () => {
    expect(toneFor(0.9)).toBe('deep')
    expect(toneFor(0.3)).toBe('light')
  })
})

describe('resolveLook', () => {
  it('starts from the layout defaults: a gap for split, an overlap for device', () => {
    expect(resolveLook('split')).toEqual({ spacing: 48, strip: 'fit', side: 'right', frame: 'browser' })
    expect(resolveLook('device')).toEqual({ spacing: -31, strip: 'fit', side: 'right', frame: 'browser' })
    expect(LOOK_DEFAULTS.split.gap).toBe(48)
  })

  it('takes a gap or an overlap, never both', () => {
    expect(resolveLook('split', { overlap: 70 }).spacing).toBe(-70)
    expect(resolveLook('device', { gap: 20 }).spacing).toBe(20)
    expect(() => resolveLook('split', { gap: 10, overlap: 10 })).toThrow(/not both/)
    expect(() => resolveLook('split', { gap: -5 })).toThrow(/0 to 400/)
    expect(() => resolveLook('split', { overlap: 'wide' })).toThrow(/0 to 400/)
  })

  it('refuses a side or frame it does not know', () => {
    expect(() => resolveLook('split', { side: 'top' })).toThrow(/Unknown side/)
    expect(() => resolveLook('device', { frame: 'phone' })).toThrow(/Unknown frame/)
    expect(() => resolveLook('tilt')).toThrow(/Unknown layout/)
  })
})

describe('parseStrip', () => {
  it('reads fit, 1:N and N', () => {
    expect(parseStrip('fit')).toBe('fit')
    expect(parseStrip(undefined)).toBe('fit')
    expect(parseStrip('1:2.5')).toBe(2.5)
    expect(parseStrip(3)).toBe(3)
  })

  it('refuses anything else', () => {
    for (const bad of ['0', '1:0.5', '1:9', '2:3', 'wide']) expect(() => parseStrip(bad)).toThrow(/fit` or 1:N/)
  })
})

describe('splitGeometry', () => {
  it('runs a page that fits edge to edge, whole', () => {
    const { strip } = splitGeometry({ pageHeight: 2348 })
    expect(strip.mode).toBe('edge')
    expect(strip.top).toBe(-1)
    expect(strip.height).toBe(1002)
    expect(strip.pageHeight).toBe(2348)
    // The page's aspect ratio is kept: 1440 wide × 2348 tall, drawn 1002 tall.
    expect(strip.width).toBe(Math.round((1002 * 1440) / 2348))
  })

  it('shows a short page whole, as a centred card', () => {
    const { strip, canvas } = splitGeometry({ pageHeight: 1500 })
    expect(strip.mode).toBe('card')
    expect(strip.pageHeight).toBe(1500)
    expect(strip.top).toBeGreaterThan(0)
    expect(strip.top * 2 + strip.height).toBeCloseTo(canvas.height, -1)
  })

  it('bleeds a long page off both edges and captures only what shows', () => {
    const { strip } = splitGeometry({ pageHeight: 8000 })
    expect(strip.mode).toBe('bleed')
    expect(strip.top).toBe(-1)
    expect(strip.pageHeight).toBeLessThan(8000)
    // What is captured covers what is drawn.
    expect((strip.pageHeight * strip.width) / 1440).toBeGreaterThanOrEqual(strip.height)
  })

  it('leaves a 48px gap by default, and still fills the canvas margin to margin', () => {
    const { window, strip } = splitGeometry({ pageHeight: 2348 })
    expect(strip.left - (window.left + window.width)).toBe(48)
    expect(window.left).toBe(56)
    expect(strip.left + strip.width).toBe(1600 - 56)
  })

  it('overlaps instead when asked, as it used to by default', () => {
    const { window, strip } = splitGeometry({ pageHeight: 2348, spacing: -70 })
    expect([window.left, window.width, strip.left]).toEqual([56, 943, 929])
  })

  it('shows more of a long page with a narrower strip, and a short page as a smaller card', () => {
    const long = splitGeometry({ pageHeight: 4014, strip: 2.5 }).strip
    expect([long.mode, long.width, long.pageHeight]).toEqual(['bleed', 400, 3608])
    expect(long.pageHeight).toBeGreaterThan(splitGeometry({ pageHeight: 4014 }).strip.pageHeight)
    const short = splitGeometry({ pageHeight: 2348, strip: 2.5 }).strip
    expect([short.mode, short.width, short.pageHeight]).toEqual(['card', 400, 2348])
  })

  it('puts the strip on the left when asked', () => {
    const { window, strip } = splitGeometry({ pageHeight: 2348, side: 'left' })
    expect(strip.left).toBe(56)
    expect(window.left - (strip.left + strip.width)).toBe(48)
  })

  it('draws a plain frame without a title bar', () => {
    const geometry = splitGeometry({ pageHeight: 2348, frame: 'plain' })
    expect(geometry.window.bar).toBe(0)
    expect(splitHtml({ geometry, background: 'white' })).not.toContain('class="bar"')
  })

  for (const canvas of CANVASES) {
    for (const look of LOOKS) {
      for (const pageHeight of [900, 2348, 9000]) {
        it(`stays on a ${canvas.width}×${canvas.height} canvas, centred, spaced as asked (${JSON.stringify(look)}, page ${pageHeight})`, () => {
          const geometry = splitGeometry({ canvas, pageHeight, ...look })
          const { window, strip } = geometry
          expect(inside(window, canvas)).toBe(true)
          expect(strip.left).toBeGreaterThanOrEqual(0)
          expect(strip.left + strip.width).toBeLessThanOrEqual(canvas.width)
          if (strip.mode === 'card') expect(strip.top + strip.height).toBeLessThanOrEqual(canvas.height)
          const { left, right, between } = pair(window, strip)
          expect(between).toBe(geometry.gap)
          expect(Math.sign(between)).toBe(Math.sign(look.spacing ?? 48))
          expect(Math.abs(left - (canvas.width - right))).toBeLessThanOrEqual(1)
        })
      }
    }
  }
})

describe('deviceGeometry', () => {
  it('overlaps the phone on the window by default', () => {
    const { window, phone, gap } = deviceGeometry()
    expect(gap).toBe(-31)
    expect(phone.left).toBe(window.left + window.width - 31)
  })

  it('separates them, or swaps sides, when asked', () => {
    const spaced = deviceGeometry({ spacing: 48 })
    expect(spaced.phone.left - (spaced.window.left + spaced.window.width)).toBe(48)
    const left = deviceGeometry({ side: 'left' })
    expect(left.phone.left).toBeLessThan(left.window.left)
  })

  for (const canvas of CANVASES) {
    for (const look of LOOKS) {
      it(`keeps both frames on a ${canvas.width}×${canvas.height} canvas, centred (${JSON.stringify(look)})`, () => {
        const geometry = deviceGeometry({ canvas, ...look })
        const { window, phone } = geometry
        expect(inside(window, canvas)).toBe(true)
        expect(inside(phone, canvas)).toBe(true)
        const { left, right, between } = pair(window, phone)
        expect(between).toBe(geometry.gap)
        expect(Math.abs(left - (canvas.width - right))).toBeLessThanOrEqual(1)
      })
    }
  }

  it('gives the phone screen the phone viewport aspect ratio', () => {
    const { phone } = deviceGeometry()
    expect(phone.screen.width / phone.screen.height).toBeCloseTo(390 / 844, 2)
  })
})

describe('composition documents', () => {
  it('reference the captures and size the canvas', () => {
    const background = backgroundCss({}, 'light')
    const split = splitHtml({ geometry: splitGeometry({ pageHeight: 2400 }), background })
    expect(split).toContain('src="desktop.png"')
    expect(split).toContain('src="long.png"')
    expect(split).toContain('width:1600px; height:1000px')
    const device = deviceHtml({ geometry: deviceGeometry(), background })
    expect(device).toContain('src="desktop.png"')
    expect(device).toContain('src="mobile.png"')
  })
})

describe('backgroundCss', () => {
  it('paints with the site palette', () => {
    const css = backgroundCss({ 'primary-700': 'oklch(40% 0.1 250)' }, 'deep')
    expect(css).toContain('oklch(40% 0.1 250)')
  })

  it('falls back for shades the site does not define', () => {
    expect(backgroundCss({}, 'deep')).toContain('#1d4ed8')
  })

  it('refuses a value that could escape the stylesheet', () => {
    expect(safeColor('red;}</style><script>alert(1)</script>')).toBeNull()
    expect(backgroundCss({ 'primary-700': 'red;}</style>' }, 'deep')).not.toContain('</style>')
    expect(safeColor('rgb(15 23 42 / .5)')).toBe('rgb(15 23 42 / .5)')
  })
})
