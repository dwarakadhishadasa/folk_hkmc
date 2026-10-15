/**
 * Story 8 geometry probe — measures the rendered page header against the
 * values the reference composition fixes. Not a test; prints a JSON report.
 */
import { chromium } from "@playwright/test"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const browser = await chromium.launch()
const context = await browser.newContext({
  storageState: path.join(repoRoot, "e2e/.auth/admin.json"),
  viewport: { width: 1440, height: 900 },
})
const page = await context.newPage()
await page.goto("http://127.0.0.1:3000/manage?view=contacts&mode=admin", { waitUntil: "networkidle" })
await page.waitForSelector("[data-grid-root]")
await page.waitForTimeout(800)

const report = await page.evaluate(() => {
  const px = (v) => (v ? Math.round(parseFloat(v) * 10) / 10 : null)
  const styleOf = (selector) => {
    const el = document.querySelector(selector)
    if (!el) return null
    const s = getComputedStyle(el)
    return {
      fontSizePx: px(s.fontSize),
      fontWeight: s.fontWeight,
      fontFamily: s.fontFamily.split(",")[0],
      lineHeightPx: px(s.lineHeight),
      letterSpacing: s.letterSpacing,
      color: s.color,
    }
  }
  const boxOf = (selector) => {
    const el = document.querySelector(selector)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), height: Math.round(r.height) }
  }

  const h1 = document.querySelector("h1")
  const meta = h1.nextElementSibling
  const tablist = document.querySelector('[data-slot="tabs-list"]')
  const activeTab = document.querySelector('[data-slot="tabs-trigger"][data-state="active"]')
  const inactiveTab = document.querySelector('[data-slot="tabs-trigger"][data-state="inactive"]')
  const scopeGroup = document.querySelector('a[href*="mode=admin"]')?.closest("div")

  return {
    title: { ...styleOf("h1"), ...boxOf("h1") },
    meta: { ...styleOf("h1 + p"), ...boxOf("h1 + p") },
    tablist: { ...styleOf('[data-slot="tabs-list"]'), ...boxOf('[data-slot="tabs-list"]') },
    activeTab: {
      ...styleOf('[data-slot="tabs-trigger"][data-state="active"]'),
      border: getComputedStyle(activeTab).borderBottom,
      ...boxOf('[data-slot="tabs-trigger"][data-state="active"]'),
      text: activeTab.textContent,
    },
    inactiveTab: {
      ...styleOf('[data-slot="tabs-trigger"][data-state="inactive"]'),
      border: getComputedStyle(inactiveTab).borderBottom,
      text: inactiveTab.textContent,
    },
    scopeGroupRight: scopeGroup ? Math.round(scopeGroup.getBoundingClientRect().right) : null,
    scopeGroupBottom: scopeGroup ? Math.round(scopeGroup.getBoundingClientRect().bottom) : null,
    metaBottom: meta ? Math.round(meta.getBoundingClientRect().bottom) : null,
    gapMetaToTabText: tablist && meta
      ? Math.round(tablist.getBoundingClientRect().top - meta.getBoundingClientRect().bottom)
      : null,
    allTabs: Array.from(document.querySelectorAll('[data-slot="tabs-trigger"]')).map((el) => {
      const r = el.getBoundingClientRect()
      const range = document.createRange()
      range.selectNodeContents(el)
      return {
        text: el.textContent,
        left: Math.round(r.left),
        right: Math.round(r.right),
        textWidth: Math.round(range.getBoundingClientRect().width),
      }
    }),
    tablistStyle: (() => {
      const s = getComputedStyle(tablist)
      return {
        columnGap: s.columnGap,
        rowGap: s.rowGap,
        padding: s.padding,
        borderBottom: s.borderBottom,
        background: s.backgroundColor,
        borderRadius: s.borderRadius,
        height: Math.round(tablist.getBoundingClientRect().height),
      }
    })(),
  }
})

console.log(JSON.stringify(report, null, 2))
await browser.close()
