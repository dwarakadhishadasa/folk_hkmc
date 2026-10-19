import { chromium } from "@playwright/test"

const BASE = "http://127.0.0.1:3000"

const browser = await chromium.launch()

for (const scheme of ["dark", "light"]) {
  const context = await browser.newContext({
    storageState: "e2e/.auth/admin.json",
    viewport: { width: 1600, height: 560 },
    colorScheme: scheme,
  })
  const page = await context.newPage()

  page.on("pageerror", (e) => console.log("PAGEERROR", String(e).slice(0, 400)))

  await page.goto(`${BASE}/manage?view=contacts&mode=admin`, { waitUntil: "domcontentloaded" })
  await page.waitForSelector("[data-grid-column]", { timeout: 45000 })
  await page.waitForSelector('tbody[data-grid-panel="ready"]', { timeout: 45000 })
  await page.waitForTimeout(600)

  const rows = await page.evaluate(() =>
    [...document.querySelectorAll("[data-grid-column]")].map((h) => ({
      id: h.getAttribute("data-grid-column"),
      fieldType: h.getAttribute("data-grid-field-type"),
      label: h.textContent?.trim(),
      color: getComputedStyle(h).color,
      weight: getComputedStyle(h).fontWeight,
      bg: getComputedStyle(h).backgroundColor,
    })),
  )

  console.log(`\n=== ${scheme}`)
  for (const r of rows) {
    console.log(
      `${String(r.id).padEnd(24)}${String(r.fieldType).padEnd(12)}w=${String(r.weight).padEnd(5)}fg=${r.color.padEnd(22)}bg=${r.bg.padEnd(22)}${r.label}`,
    )
  }

  await page.locator("[data-grid-root]").screenshot({ path: `/tmp/opencode/grid-${scheme}.png` })
  console.log(`screenshot -> /tmp/opencode/grid-${scheme}.png`)
  await context.close()
}

await browser.close()