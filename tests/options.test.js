import { describe, expect, it } from 'vitest'

import { normalizeOptions } from '../src/options.js'
import { describeChanges, needsFor, variantsFor } from '../src/compose.js'

describe('normalizeOptions', () => {
  it('fills the defaults', () => {
    const options = normalizeOptions()
    expect(options).toMatchObject({
      layout: 'auto',
      tone: 'auto',
      canvas: { width: 1600, height: 1000 },
      scale: 1,
      format: 'webp',
      quality: 82,
      hide: [],
    })
  })

  it('reads the format from the output file', () => {
    expect(normalizeOptions({ output: 'card.png' }).format).toBe('png')
    expect(() => normalizeOptions({ output: 'card.gif' })).toThrow(/image format/)
  })

  it('refuses what it cannot draw', () => {
    expect(() => normalizeOptions({ layout: 'tilt' })).toThrow(/Unknown layout "tilt"/)
    expect(() => normalizeOptions({ tone: 'neon' })).toThrow(/Unknown tone/)
    expect(() => normalizeOptions({ canvas: { width: 100, height: 100 } })).toThrow(/320–4096/)
    expect(() => normalizeOptions({ scale: 3 })).toThrow(/scale is 1 or 2/)
    expect(() => normalizeOptions({ quality: 0 })).toThrow(/1 to 100/)
    expect(() => normalizeOptions({ hide: ['', '.x'] })).toThrow(/selectors/)
  })

  it('checks the look for every layout it could be drawn with', () => {
    expect(() => normalizeOptions({ strip: '1:20' })).toThrow(/strip/)
    expect(() => normalizeOptions({ gap: 10, overlap: 5 })).toThrow(/not both/)
    expect(normalizeOptions({ layout: 'device', gap: 12 }).look.gap).toBe(12)
  })
})

describe('variantsFor', () => {
  it('shows the current look, then one change each, for a page that scrolls', () => {
    const variants = variantsFor({ auto: 'split', luminance: 0.9 }, normalizeOptions())
    expect(variants).toEqual([
      {},
      { gap: undefined, overlap: 70 },
      { strip: '1:2.5' },
      { side: 'left' },
      { frame: 'plain' },
      { tone: 'light' },
      { layout: 'device' },
    ])
  })

  it('flips from what is chosen, not from the defaults', () => {
    const variants = variantsFor({ auto: 'split', luminance: 0.2 }, normalizeOptions({ overlap: 20, strip: '1:3', side: 'left' }))
    expect(variants).toContainEqual({ overlap: undefined, gap: 48 })
    expect(variants).toContainEqual({ strip: 'fit' })
    expect(variants).toContainEqual({ side: 'right' })
    expect(variants).toContainEqual({ tone: 'deep' })
  })

  it('offers no strip change for a device page', () => {
    const variants = variantsFor({ auto: 'device' }, normalizeOptions())
    expect(variants).toHaveLength(6)
    expect(variants).toContainEqual({ overlap: undefined, gap: 48 })
    expect(variants).toContainEqual({ layout: 'split' })
  })
})

describe('needsFor', () => {
  const measurements = { scrollHeight: 4014, viewport: { width: 1440, height: 900 } }

  it('asks for exactly as much of the page as the strip shows', () => {
    expect(needsFor({ measurements, auto: 'split' }, normalizeOptions())).toEqual({ long: 3070 })
    expect(needsFor({ measurements, auto: 'split' }, normalizeOptions({ strip: '1:2.5' }))).toEqual({ long: 3608 })
  })

  it('asks for the phone view for the device layout', () => {
    expect(needsFor({ measurements, auto: 'split' }, normalizeOptions({ layout: 'device' }))).toEqual({ mobile: true })
  })
})

describe('describeChanges', () => {
  it('captions a variant by what it changes', () => {
    expect(describeChanges({})).toBe('current')
    expect(describeChanges({ gap: undefined, overlap: 70 })).toBe('overlap 70')
  })
})
