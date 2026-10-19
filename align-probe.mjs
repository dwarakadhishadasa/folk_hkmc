import { chromium } from "@playwright/test"

const BASE = "http://127.0.0.1:3000"

const browser = await chromium.launch()
const context = await browser.newContext({
  storageState: "e2e/.auth/admin.json",
  viewport: { width: 1600, height: 900 },
})
const page = await context.newPage()

await page.goto(`${BASE}/manage?view=contacts&mode=admin`, { waitUntil: "domcontentloaded" })
await page.waitForSelector("[data-grid-column]", { timeout: 45000 })
await page.waitForSelector('tbody[data-grid-panel="ready"]', { timeout: 45000 })

const info = await page.evaluate(() => {
  const describe = (el, name) => {
    if (!el) return { name, missing: true }
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return {
      name,
      left: Math.round(r.left * 100) / 100,
      right: Math.round(r.right * 100) / 100,
      width: Math.round(r.width * 100) / 100,
      paddingLeft: cs.paddingLeft,
      paddingRight: cs.paddingRight,
      marginLeft: cs.marginLeft,
      maxWidth: cs.maxWidth,
      display: cs.display,
      className: String(el.className).slice(0, 160),
    }
  }

  const chain = []
  let node = document.querySelector("[data-grid-table]")
  while (node && chain.length < 6) {
    chain.push(describe(node, node.getAttribute("data-grid-table") !== null ? "table" : node.tagName.toLowerCase()))
    node = node.parentElement
  }

  const logo =
    document.querySelector("header a, header img, [data-grid-root]") &&
    document.querySelector("header")

  return {
    chain,
    header: describe(logo, "header"),
    headerInner: describe(logo?.firstElementChild ?? null, "header > first child"),
    headerLinks: [...(logo?.querySelectorAll("a") ?? [])].slice(0, 3).map((a, i) => describe(a, `header a[${i}] ${a.textContent?.trim().slice(0, 20)}`)),
    headerSvgs: [...(logo?.querySelectorAll("svg") ?? [])].slice(0, 2).map((s, i) => describe(s, `header svg[${i}]`)),
    toolbarButton: describe(document.querySelector("[data-grid-hide-fields-control]"), "hide-fields control"),
  }
})

console.log(JSON.stringify(info, null, 2))

await page.screenshot({ path: "/tmp/opencode/align-full.png", fullPage: false })
await browser.close()