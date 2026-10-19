/**
 * CAP-7 — the light/dark switch and grid legibility in both themes.
 *
 * | Test    | Scenario                                   | Claim under test                                                     |
 * | ------- | ------------------------------------------ | -------------------------------------------------------------------- |
 * | theme 1 | a fresh context, dark system preference     | `<html>` arrives with `.dark` before the grid paints                 |
 * | theme 2 | a fresh context, light system preference    | `<html>` arrives with no `.dark`                                      |
 * | theme 3 | the toggle                                  | the class flips, `localStorage.theme` is written, the icon flips      |
 * | theme 4 | reload after an explicit toggle             | `.dark` survives — the choice outranks `system`                       |
 * | theme 5 | back to the system option                   | the page follows `prefers-color-scheme` again                          |
 * | theme 6 | storage blocked                             | the app still renders and the toggle still switches the class         |
 * | theme 7 | one toggle, in the header                   | exactly one, inside `<header>`; `components/grid/` imports none       |
 * | theme 8 | the focus ring, both themes                 | `--ring` vs `--card` is ≥ 3:1 in both                                |
 * | theme 9 | the destructive cell, both themes           | `--destructive` vs `--card` is ≥ 4.5:1 in both                        |
 * | theme 10 | the frozen-run divider, both themes         | rendered, non-zero, distinguishable from the surfaces it separates    |
 * | theme 11 | two screenshots                             | they differ, the dark one is materially darker, the sampled pixel is that theme's `--card` |
 * | theme 12 | a clean console                             | no hydration error for the theme class                                |
 * | theme 13 | the staff surfaces, forced dark             | shells are `--background`; fields are `--field`, their ink ≥ 4.5:1          |
 *
 * ## Why the token edits are measured, not sampled
 *
 * The defect this story fixes is two `.dark` token *values*, so the assertion
 * reads the resolved custom property and converts it to sRGB. The conversion
 * runs in Chromium itself: a probe element carries `color: var(--ring)`, the
 * computed colour is handed to a 1×1 canvas, and `getImageData` returns the
 * sRGB bytes the engine would actually paint. A pixel sample of a 1px inset
 * ring would be a rendering detail; this measures the thing the contract names.
 * Theme 11 covers the separate claim — that the two themes *look* different —
 * at the level a screenshot can honestly support.
 *
 * ## Why the destructive cell is produced, not stubbed
 *
 * `--destructive` only reaches a `<td>` through a rejected write, so the spec
 * drives the preview harness's own rejecting row (`REF-0250`, which
 * `grid-preview.tsx` always rejects) rather than injecting a class. The cell
 * that comes back is a real, rendered `text-destructive` cell.
 *
 * ## Why the divider is asserted as "distinguishable"
 *
 * `--border` is a hairline, not text or a control boundary. There is no
 * authorized `--border` change in this story, so the honest assertion is that
 * it renders at a non-zero width and is not the same colour as either surface
 * it separates, at both themes. The measured values are printed so a reader can
 * see the symmetry rather than infer it.
 */

import { readFileSync } from "node:fs"
import path from "node:path"

import { expect, test, type Locator, type Page } from "@playwright/test"

import { repoRoot } from "../fixtures/roles"
import {
  cellAt,
  filterGlobally,
  focusPreviewCellAt,
  openPreviewGrid,
} from "../fixtures/manage-grid"

/** The preview row whose writes always reject. See `GRID_PREVIEW_FAILING_REF`. */
const FAILING_REF = "REF-0250"

/** The preview's frozen identity column — the fallback pins the first one. */
const FROZEN_COLUMN_ID = "ref"

interface Rgb {
  r: number
  g: number
  b: number
  /** The colour as Chromium computed it, kept for readable failure messages. */
  color: string
}

/** WCAG relative luminance, from sRGB bytes. */
function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (value: number) => {
    const v = value / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }

  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** WCAG contrast ratio between two already-sRGB colours. */
function contrastRatio(a: Rgb, b: Rgb): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)

  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Resolve a design token to sRGB, converting in the browser.
 *
 * A hidden probe carries the token as its `color`, so what Chromium computes is
 * the token *after* the `.dark` override — not the authored `:root` value. The
 * computed string is then painted into a 1×1 canvas and read back, which is the
 * engine's own oklch → sRGB conversion rather than a reimplementation of it.
 */
async function tokenRgb(page: Page, token: string): Promise<Rgb> {
  return page.evaluate((name) => {
    const probe = document.createElement("span")
    probe.style.color = `var(${name})`
    document.body.appendChild(probe)
    const color = getComputedStyle(probe).color
    probe.remove()

    const canvas = document.createElement("canvas")
    canvas.width = 1
    canvas.height = 1
    const context = canvas.getContext("2d", { willReadFrequently: true })
    if (!context) throw new Error("no 2d context to convert the token with")
    context.fillStyle = color
    context.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data

    if (a !== 255) throw new Error(`--${name} resolved to a translucent colour: ${color}`)

    return { r, g, b, color }
  }, token)
}

/**
 * Convert an already-computed CSS colour string to sRGB, in the browser.
 *
 * The same 1×1 canvas as `tokenRgb`, fed a literal instead of a `var(--…)`. It
 * exists so an assertion can read what an element *actually resolved to* —
 * `getComputedStyle(el).borderRightColor` and friends — rather than what the
 * token it was authored with says it should be. A border that fell back to a
 * browser default, to `transparent`, or to some other token would sail through
 * an assertion made against `--border` alone.
 */
async function cssColorToRgb(page: Page, color: string, what: string): Promise<Rgb> {
  return page.evaluate(
    ({ value, label }) => {
      const canvas = document.createElement("canvas")
      canvas.width = 1
      canvas.height = 1
      const context = canvas.getContext("2d", { willReadFrequently: true })
      if (!context) throw new Error("no 2d context to convert the colour with")
      context.fillStyle = value
      context.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data

      if (a !== 255) throw new Error(`${label} resolved to a translucent colour: ${value}`)

      return { r, g, b, color: value }
    },
    { value: color, label: what },
  )
}

/** The `<html>` class list, as the theme class itself would read it. */
function htmlClasses(page: Page): Promise<string> {
  return page.evaluate(() => document.documentElement.className)
}

/** `localStorage.theme`, or `null` when nothing has been stored. */
function storedTheme(page: Page): Promise<string | null> {
  return page.evaluate(() => window.localStorage.getItem("theme"))
}

/**
 * The staff surfaces this story grades, and whether the start-session form is
 * the branch that must be on screen.
 *
 * `/sessions` is the exception: the seeded database carries an active session,
 * so the page renders the live dashboard rather than the form. Both branches
 * are real, so the test waits for whichever one mounts and grades the form's
 * fields whenever the form is the one that did.
 */
const STAFF_SURFACES: ReadonlyArray<{ route: string; form: boolean }> = [
  { route: "/contact", form: true },
  { route: "/sessions", form: false },
  { route: "/volunteers", form: true },
  { route: "/admin/invite", form: true },
]

interface FieldColours {
  readonly label: string
  readonly background: string
  readonly color: string
}

/**
 * Every enabled text-entry control, with the colours it actually resolved to.
 *
 * Checkboxes and radios are excluded deliberately: the UA draws them and they
 * own no background of their own, so asserting `--card` on one would assert a
 * surface it never had. Disabled controls are excluded for the opposite reason —
 * they resolve to `--muted` on purpose (`disabled:bg-muted`), which is correct
 * behaviour rather than the defect this row is looking for.
 */
function fieldColours(page: Page): Promise<FieldColours[]> {
  return page.evaluate(() =>
    Array.from(
      document.querySelectorAll<HTMLElement>(
        'input:not([type="checkbox"]):not([type="radio"]):not(:disabled), select:not(:disabled), textarea:not(:disabled)',
      ),
    ).map((field) => {
      const style = getComputedStyle(field)

      return {
        label: `${field.tagName.toLowerCase()}${field.getAttribute("name") ? `[name="${field.getAttribute("name")}"]` : ""}`,
        background: style.backgroundColor,
        color: style.color,
      }
    }),
  )
}

/** The background of the `min-h-screen` shell that wraps `<main>`. */
function shellBackground(page: Page): Promise<string> {
  return page.evaluate(() => {
    const main = document.querySelector("main")
    if (!main?.parentElement) throw new Error("the page has no <main> with a shell around it")

    return getComputedStyle(main.parentElement).backgroundColor
  })
}

/**
 * Let the theme swap's CSS transitions finish before anything is measured.
 *
 * The form fields carry `transition-all`, so toggling `.dark` animates their
 * `background-color` and `color` for ~150ms. A measurement taken inside that
 * window samples a blend of the two themes — neither theme — and would fail a
 * token assertion for a reason that has nothing to do with the tokens.
 *
 * Infinite animations are filtered out: their `finished` promise never settles,
 * and none of them paints a field.
 */
async function settleThemeTransition(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const nextFrame = () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

    // Two frames: the first applies the class, the second lets the transition it
    // created register itself before it is awaited.
    await nextFrame()
    await nextFrame()

    const finite = document.getAnimations().filter((animation) => {
      const endTime = animation.effect?.getComputedTiming().endTime

      return typeof endTime === "number" && Number.isFinite(endTime)
    })

    await Promise.all(finite.map((animation) => animation.finished.catch(() => undefined)))
  })
}

/** The header's theme toggle — one stable accessible name, icon-independent. */
function themeToggle(page: Page): Locator {
  return page.getByRole("button", { name: "Toggle theme" })
}

/**
 * The toggle's icon, read as *which* icon is showing.
 *
 * `aria-hidden` means the icons contribute no accessible name, so the toggle is
 * addressable by the same handle before and after the swap. Which icon is
 * present is read from the DOM instead, and it is what proves the swap is
 * visible rather than only recorded in storage.
 */
async function expectToggleIcon(page: Page, icon: "sun" | "moon"): Promise<void> {
  await expect(
    themeToggle(page).locator(icon === "sun" ? "svg.lucide-sun" : "svg.lucide-moon"),
    `the toggle should be showing the ${icon}`,
  ).toHaveCount(1)
}

/** Wait for `<html>` to carry (or not carry) `.dark`. */
async function expectDark(page: Page, dark: boolean): Promise<void> {
  const label = dark ? "a dark <html>" : "a light <html>"
  await expect
    .poll(async () => (await htmlClasses(page)).split(/\s+/).includes("dark"), {
      message: `<html> never settled on ${label} (class was "${await htmlClasses(page)}")`,
    })
    .toBe(dark)
}

/**
 * Force a theme for a contrast measurement.
 *
 * The class is set directly rather than through the toggle so that both themes
 * are measured on the *same* page, the same rows and the same focused cell —
 * a theme swap that also re-navigates would compare two different surfaces.
 */
async function forceTheme(page: Page, dark: boolean): Promise<void> {
  await page.evaluate((wanted) => {
    document.documentElement.classList.toggle("dark", wanted)
  }, dark)
  await expectDark(page, dark)
}

interface ScreenshotAnalysis {
  width: number
  height: number
  meanLuminance: number
  sample: Rgb | null
}

/**
 * Read a PNG capture: its mean luminance and one sampled pixel.
 *
 * Decoded in the browser with `createImageBitmap` + canvas rather than in Node,
 * because the repo carries no PNG decoder and adding one for a spec would be a
 * dependency this story does not authorize. The base64 round-trip keeps the
 * measurement on the same engine that produced the pixels.
 */
async function analyzeScreenshot(
  page: Page,
  capture: Buffer,
  sampleAt: { x: number; y: number },
): Promise<ScreenshotAnalysis> {
  return page.evaluate(
    async ({ base64, point }) => {
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index)
      }

      const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }))
      const width = bitmap.width
      const height = bitmap.height
      const canvas = document.createElement("canvas")
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext("2d", { willReadFrequently: true })
      if (!context) throw new Error("no 2d context to decode the capture")
      context.drawImage(bitmap, 0, 0)
      const { data } = context.getImageData(0, 0, width, height)
      bitmap.close()

      let total = 0
      for (let index = 0; index < data.length; index += 4) {
        total += 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2]
      }

      const inRange =
        point.x >= 0 && point.y >= 0 && point.x < width && point.y < height
      const offset = (Math.floor(point.y) * width + Math.floor(point.x)) * 4

      return {
        width,
        height,
        meanLuminance: total / (data.length / 4),
        sample: inRange
          ? { r: data[offset], g: data[offset + 1], b: data[offset + 2], color: "sampled" }
          : null,
      }
    },
    { base64: capture.toString("base64"), point: sampleAt },
  )
}

/**
 * The pixel to sample a capture at: a grid cell's own padding, clear of its text
 * and of the hairline below it, so the sample is the row's `--card` surface and
 * not a glyph's antialias.
 *
 * Measured from the *current* layout every time it is called. The capture is the
 * viewport, so the cell is scrolled into view first — the preview's own chrome
 * pushes the first rows past the fold — and the box is re-read rather than
 * reused, because a navigation in between resets the virtualized scroll.
 */
async function gridSurfaceSample(page: Page): Promise<{ x: number; y: number }> {
  const cell = cellAt(page, 1, "region")
  await cell.scrollIntoViewIfNeeded()
  const box = await cell.boundingBox()

  expect(box, "the sampled cell must be laid out").not.toBeNull()

  return {
    x: Math.round(box!.x + box!.width - 6),
    y: Math.round(box!.y + box!.height - 5),
  }
}

/**
 * Per-channel tolerance for a painted pixel against the token it should be.
 *
 * Chromium's oklch → sRGB is not rounded the same way a hand conversion would
 * round it, so the sample is compared to the token Chromium itself resolved
 * (theme 8/9/10 do the same) rather than to a reimplementation.
 */
const PIXEL_TOLERANCE = 6

function expectRgbNear(actual: Rgb | null, expected: Rgb, what: string): void {
  expect(actual, `${what}: the sample point fell outside the capture`).not.toBeNull()

  const delta = Math.max(
    Math.abs(actual!.r - expected.r),
    Math.abs(actual!.g - expected.g),
    Math.abs(actual!.b - expected.b),
  )

  expect(
    delta,
    `${what}: sampled rgb(${actual!.r}, ${actual!.g}, ${actual!.b}) against ${expected.color} → rgb(${expected.r}, ${expected.g}, ${expected.b})`,
  ).toBeLessThanOrEqual(PIXEL_TOLERANCE)
}

test.describe("CAP-7 theme switch", () => {
  test("theme 1 — a fresh context with a dark system preference arrives dark", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" })
    await openPreviewGrid(page)

    await expectDark(page, true)
    expect(
      await storedTheme(page),
      'defaultTheme="system" must not invent an explicit stored choice',
    ).toBeNull()
  })

  test("theme 2 — a fresh context with a light system preference arrives light", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" })
    await openPreviewGrid(page)

    await expectDark(page, false)
  })

  test("theme 3 — the toggle flips the class, the icon and the stored choice", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" })
    // The preview page does not mount the app header, so the toggle under test
    // is driven from a real app page — which is also the page the story grades.
    await page.goto("/")
    await expect(themeToggle(page)).toBeVisible()
    await expectDark(page, false)
    await expectToggleIcon(page, "moon")

    await themeToggle(page).click()

    await expectDark(page, true)
    await expect
      .poll(() => storedTheme(page), { message: "the explicit choice was never stored" })
      .toBe("dark")
    await expectToggleIcon(page, "sun")

    await themeToggle(page).click()

    await expectDark(page, false)
    await expect.poll(() => storedTheme(page)).toBe("light")
    await expectToggleIcon(page, "moon")
  })

  test("theme 4 — an explicit dark choice survives a reload on a light system", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" })
    await page.goto("/")
    await themeToggle(page).click()
    await expectDark(page, true)

    await page.reload()

    // Observed through the class itself, after the reload, not through the
    // toggle's own state: an explicit choice outranks `defaultTheme="system"`.
    await expectDark(page, true)
    expect(await storedTheme(page), "the choice outlived the reload").toBe("dark")
    await expectToggleIcon(page, "sun")
  })

  test("theme 5 — the system option is honoured again once it is the stored value", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" })
    await page.goto("/")
    await themeToggle(page).click()
    await expectDark(page, true)

    // Returning to the system option is what `enableSystem` exists for. The
    // toggle offers light/dark only by design, so the option is written
    // directly and the page reloaded — which is exactly this row's claim: the
    // page follows `prefers-color-scheme` again.
    await page.evaluate(() => window.localStorage.setItem("theme", "system"))
    await page.reload()

    await expectDark(page, false)

    await page.emulateMedia({ colorScheme: "dark" })
    await expectDark(page, true)
  })

  test("theme 6 — with storage blocked the app still renders and still switches", async ({
    browser,
  }) => {
    // A context of its own rather than the suite's `storageState`: the row is
    // about storage being unavailable, not about who is signed in, and a staff
    // session reaches an *unrelated* unguarded `localStorage.getItem` in
    // `pwa-install-prompt.tsx`, which blanks the tree before the toggle is ever
    // addressable. That is a pre-existing defect outside this story's scope, and
    // asserting around it here would hide it rather than fix it.
    //
    // **Writes** are what get blocked, not reads. That is the half of "storage
    // blocked" this row is about — the toggle's only storage call is
    // `setItem` — and blocking reads as well takes Next's own dev-mode client
    // chunk down with it (it reads storage while hydrating and throws an
    // uncaught `SecurityError` before React commits), which fails the row for a
    // reason of its own. With writes blocked, the claim is the honest one: the
    // theme still switches for the session and nothing throws.
    const context = await browser.newContext({ colorScheme: "light", serviceWorkers: "block" })

    try {
      const page = await context.newPage()
      const pageErrors: string[] = []
      page.on("pageerror", (error) => pageErrors.push(error.message))

      await page.goto("/")
      await expect(themeToggle(page), "the shell renders").toBeVisible()

      await page.evaluate(() => {
        const blocked = () => {
          throw new DOMException("storage is blocked in this context", "SecurityError")
        }
        const real = window.localStorage
        Object.defineProperty(window, "localStorage", {
          configurable: true,
          get: () => ({
            getItem: real.getItem.bind(real),
            setItem: blocked,
            removeItem: blocked,
            clear: blocked,
            key: real.key.bind(real),
            length: real.length,
          }),
        })
      })

      await themeToggle(page).click()

      await expectDark(page, true)
      expect(
        await page.evaluate(() => window.localStorage.getItem("theme")),
        "a blocked write cannot have persisted the choice",
      ).toBeNull()
      expect(pageErrors, "neither the provider nor the toggle may throw").toEqual([])
    } finally {
      await context.close()
    }
  })

  test("theme 7 — exactly one toggle, and it is inside the header", async ({ page }) => {
    await page.goto("/manage?view=contacts&mode=admin")

    await expect(
      page.locator("header").getByRole("button", { name: "Toggle theme" }),
      "the toggle belongs to the app header",
    ).toHaveCount(1)
    await expect(themeToggle(page), "the header is the only place the toggle may exist").toHaveCount(1)
    await expect(
      page.locator("main").getByRole("button", { name: "Toggle theme" }),
      "the grid toolbar must not own a second toggle",
    ).toHaveCount(0)
    // That `components/grid/` imports no toggle is asserted once, offline, by
    // `harness-guards.spec.ts` — the same file that guards the grid's other
    // token cleanliness. Two copies of one grep is one to forget to update.
  })

  test("theme 8 — the focus ring reads at 3:1 against --card in both themes", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" })
    await openPreviewGrid(page)
    await focusPreviewCellAt(page, 0, "owner")

    await expect(
      cellAt(page, 0, "owner"),
      "the focused cell carries the ring; the fix is the token, not the class",
    ).toHaveClass(/ring-ring/)

    for (const dark of [false, true]) {
      await forceTheme(page, dark)

      const ring = await tokenRgb(page, "--ring")
      const card = await tokenRgb(page, "--card")
      const ratio = contrastRatio(ring, card)
      const theme = dark ? "dark" : "light"

      // Printed either way: the value is the evidence, not just the verdict.
      console.log(`${theme} --ring ${ring.color} vs --card ${card.color} → ${ratio.toFixed(2)}:1`)

      expect(ratio, `${theme}: the focus ring measures ${ratio.toFixed(2)}:1 against --card`).toBeGreaterThanOrEqual(3)
    }
  })

  test("theme 9 — a rejected write's destructive text reads at 4.5:1 in both themes", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" })
    await openPreviewGrid(page)
    await filterGlobally(page, FAILING_REF)
    await focusPreviewCellAt(page, 0, "owner")

    await page.keyboard.press("Delete")

    const failingCell = cellAt(page, 0, "owner")
    await expect(failingCell, "the harness rejects every write to this row").toHaveClass(
      /text-destructive/,
    )

    for (const dark of [false, true]) {
      await forceTheme(page, dark)
      await expect(failingCell, "the error survives the swap").toHaveClass(/text-destructive/)

      const destructive = await tokenRgb(page, "--destructive")
      const card = await tokenRgb(page, "--card")
      const ratio = contrastRatio(destructive, card)
      const theme = dark ? "dark" : "light"

      console.log(
        `${theme} --destructive ${destructive.color} vs --card ${card.color} → ${ratio.toFixed(2)}:1`,
      )

      expect(
        ratio,
        `${theme}: the destructive cell measures ${ratio.toFixed(2)}:1 against --card`,
      ).toBeGreaterThanOrEqual(4.5)
    }
  })

  test("theme 10 — the frozen-run divider renders and reads at both themes", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" })
    await openPreviewGrid(page)

    for (const dark of [false, true]) {
      await forceTheme(page, dark)

      const divider = await cellAt(page, 1, FROZEN_COLUMN_ID).evaluate((cell) => {
        const style = getComputedStyle(cell)

        return {
          width: Number.parseFloat(style.borderRightWidth),
          style: style.borderRightStyle,
          color: style.borderRightColor,
        }
      })
      const theme = dark ? "dark" : "light"

      expect(divider.style, `${theme}: the divider must render as a border`).not.toBe("none")
      expect(divider.width, `${theme}: the divider must be wider than nothing`).toBeGreaterThan(0)

      // Asserted on the colour the border *rendered*, not on `--border`. The
      // token is read too, but only as printed evidence: a cell whose
      // `border-right` fell back to a default, to another token, or to
      // something transparent would still look fine against the authored
      // `--border`, and that is exactly the failure this row exists to catch.
      const painted = await cssColorToRgb(page, divider.color, `${theme} the frozen-run divider`)
      const border = await tokenRgb(page, "--border")
      const card = await tokenRgb(page, "--card")
      const background = await tokenRgb(page, "--background")

      console.log(
        `${theme} divider ${divider.color} (${divider.width}px, ${divider.style}) · ` +
          `--border ${border.color} vs --card ${card.color} → ${contrastRatio(border, card).toFixed(2)}:1`,
      )

      // Distinguishable, not a WCAG ratio: `--border` is a hairline, this story
      // authorizes no `--border` change, and the two themes are already
      // symmetric. The claim is that the divider is not the same colour as
      // either surface it separates.
      expect(
        contrastRatio(painted, card),
        `${theme}: the divider (${painted.color}) vanished into --card`,
      ).toBeGreaterThan(1.05)
      expect(
        contrastRatio(painted, background),
        `${theme}: the divider (${painted.color}) vanished into --background`,
      ).toBeGreaterThan(1.05)
    }
  })

  test("theme 11 — the two themes render differently and the dark one is darker", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" })
    await openPreviewGrid(page)

    const lightCard = await tokenRgb(page, "--card")
    const lightSample = await gridSurfaceSample(page)
    const lightCapture = await page.screenshot()
    const light = await analyzeScreenshot(page, lightCapture, lightSample)

    // The swap goes through the toggle, not through a poked class: the toggle is
    // the control the story ships, and using it is what proves the whole path.
    await page.goto("/")
    await themeToggle(page).click()
    await expectDark(page, true)
    await page.goto("/dev/grid-preview")
    await expectDark(page, true)

    // Re-measured, not carried over: the navigation above reloads the page, so
    // the virtualized scroll container starts at the top again and the light
    // capture's coordinates would be sampling whatever happens to sit there now.
    const darkCard = await tokenRgb(page, "--card")
    const darkSample = await gridSurfaceSample(page)
    const darkCapture = await page.screenshot()
    const dark = await analyzeScreenshot(page, darkCapture, darkSample)

    console.log(
      `mean luminance: light ${light.meanLuminance.toFixed(1)} vs dark ${dark.meanLuminance.toFixed(1)}`,
    )
    console.log(
      `sampled grid surface: light at (${lightSample.x}, ${lightSample.y}) of ${light.width}×${light.height} ` +
        `→ rgb(${light.sample?.r}, ${light.sample?.g}, ${light.sample?.b}); ` +
        `dark at (${darkSample.x}, ${darkSample.y}) of ${dark.width}×${dark.height} ` +
        `→ rgb(${dark.sample?.r}, ${dark.sample?.g}, ${dark.sample?.b})`,
    )

    expect(
      lightCapture.equals(darkCapture),
      "the two captures are byte-identical, so the themes are not rendering differently",
    ).toBe(false)
    expect(light.meanLuminance, "the dark capture must be materially darker").toBeGreaterThan(
      dark.meanLuminance * 1.5,
    )
    expectRgbNear(light.sample, lightCard, "the light grid surface is not --card")
    expectRgbNear(dark.sample, darkCard, "the dark grid surface is not --card")
  })

  test("theme 12 — a page load produces no hydration error for the theme class", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" })

    const messages: string[] = []
    page.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning") {
        messages.push(`${message.type()}: ${message.text()}`)
      }
    })

    // `/`, not `/dev/grid-preview`: the preview page does not mount the app
    // header, and the header is where this story's real hydration risk lives —
    // `ThemeToggle` returns `null` before mount, so the server renders no button
    // and the client renders one. That is the mismatch `suppressHydrationWarning`
    // on `<html>` exists for, and grading it on a page without the toggle would
    // assert nothing about it.
    await page.goto("/")
    await expect(themeToggle(page), "the header's toggle must mount").toBeVisible()
    await expectDark(page, true)

    const hydration = messages.filter((text) =>
      /hydrat|did not match|server rendered html|server HTML/i.test(text),
    )

    expect(hydration, `console output:\n${messages.join("\n")}`).toEqual([])
  })

  test("theme 13 — the staff surfaces paint their shells and fields through tokens", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" })

    for (const { route, form } of STAFF_SURFACES) {
      await page.goto(route)
      await expectDark(page, false)

      // Set on the same render rather than through the toggle: the claim is
      // about the tokens the page resolves, and a reload would re-mount every
      // field for no extra evidence.
      await forceTheme(page, true)

      // `/sessions` renders `SessionsLoadingState` until its client fetch
      // settles, then picks between the start-session form and the live
      // dashboard. Waiting for one of the two is what makes the shell
      // measurement describe a settled page rather than a skeleton.
      await expect
        .poll(
          async () =>
            (await fieldColours(page)).length > 0 ||
            (await page.getByRole("heading", { name: "Attendance QR Code" }).count()) > 0,
          { message: `${route} never finished loading` },
        )
        .toBe(true)

      await settleThemeTransition(page)

      const background = await tokenRgb(page, "--background")
      const fieldSurface = await tokenRgb(page, "--field")

      const shell = await cssColorToRgb(page, await shellBackground(page), `${route} shell`)
      expectRgbNear(shell, background, `${route}: the page shell is not --background`)

      const fields = await fieldColours(page)

      if (form) {
        expect(fields.length, `${route} rendered no enabled text field to grade`).toBeGreaterThan(0)
      }

      for (const field of fields) {
        const surface = await cssColorToRgb(
          page,
          field.background,
          `${route} ${field.label} background`,
        )
        const ink = await cssColorToRgb(page, field.color, `${route} ${field.label} ink`)

        expectRgbNear(surface, fieldSurface, `${route}: ${field.label} does not sit on --field`)

        const ratio = contrastRatio(ink, surface)
        expect(
          ratio,
          `${route} ${field.label}: ${ink.color} on ${surface.color} → ${ratio.toFixed(2)}:1, below 4.5:1`,
        ).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  test("providers.tsx mounts ThemeProvider outermost with the recipe's props", () => {
    const source = readFileSync(path.join(repoRoot, "components", "providers.tsx"), "utf8")

    expect(source, "the provider is not mounted").toContain("<ThemeProvider")
    for (const prop of [
      'attribute="class"',
      'defaultTheme="system"',
      "enableSystem",
      "disableTransitionOnChange",
    ]) {
      expect(source, `ThemeProvider is missing ${prop}`).toContain(prop)
    }

    // Outermost, asserted from the source text rather than inferred from a
    // rendering: the outermost element of the returned tree is the first open
    // tag after the `return (`, and that must be `ThemeProvider`.
    const tree = source.slice(source.indexOf("return ("))
    const firstOpenTag = tree.match(/<([A-Za-z][\w.]*)/)?.[1]

    expect(firstOpenTag, "ThemeProvider must open the returned tree").toBe("ThemeProvider")
  })
})
