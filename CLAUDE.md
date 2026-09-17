# CLAUDE.md

`@uniweb/snapshot` is a package in the framework scope — see `../CLAUDE.md` for scope-level context
(the public-repo boundary, ESM and no TypeScript, publishing via `pnpm framework:publish:*`, which
only a human runs).

## What this package is

Preview images of a site, composed from captures of the site running in a real browser. The
`uniweb snapshot` verb (`../cli/src/commands/snapshot.js`) is its front door: it finds the site,
puts it behind a URL, and records the image as `site.yml::preview`. Everything about capturing and
composing is here.

## Rules that shape every file here

- **One browser does both jobs.** It captures the site and it rasterizes the composition, which is
  plain HTML and CSS. Do not add a second rendering engine (canvas, SVG rasterizer, image
  compositing) for something CSS can express.
- **Layouts are pure.** `src/layouts/` takes measurements and returns geometry and HTML: no Node
  imports, no browser, no I/O. That keeps them unit-testable and usable anywhere.
- **Nothing downloads a browser.** `launchBrowser` uses what is installed; an install is a step the
  user takes. `playwright-core` (no bundled browsers) is the dependency, never `playwright`.
- **Capture once, compose many.** `captureSite` takes what the planned looks need and `compose`
  draws any look from it; `snapshot` and `compare` are both that. A look is data (`resolveLook`),
  never a new code path, so a new option belongs in `layouts/options.js` and the geometries.
- **A capture is always of a URL.** Serving a local site (`src/sources.js`) is a separate step, so a
  running dev server, a static build and a deployed site go through the same code.
- **Behaviour claims are tested in a real browser.** `tests/live.test.js` holds each measured fact
  (viewport units in a long capture, pinned and sticky elements, `hide`), with a control that proves the
  assertion can fail. It skips when no browser can be launched and says why;
  `UNIWEB_SNAPSHOT_REQUIRE_BROWSER=1` turns the skip into a failure.
- **Palette values are data from the page.** They pass `safeColor` before they reach a stylesheet.
- **Layouts must stay on any canvas `--size` accepts.** Lengths scale by the canvas unit, never by
  one side alone, and `tests/layouts.test.js` checks a matrix of sizes including the extremes.
