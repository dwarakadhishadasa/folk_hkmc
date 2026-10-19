import { chromium } from "@playwright/test"

const BASE = "http://127.0.0.1:3000"

const browser = await chromium.launch()
const context = await browser.newContext({
  storageState: "e2e/.auth/admin.json",
  viewport: { width: 1600, height: 800 },
})
const page = await context.newPage()

page.on("pageerror", (e) => console.log("PAGEERROR", String(e).slice(0, 400)))

await page.goto(`${BASE}/manage?view=contacts&mode=admin`, { waitUntil: "domcontentloaded" })
await page.waitForSelector("[data-grid-column]", { timeout: 45000 })
await page.waitForSelector('tbody[data-grid-panel="ready"]', { timeout: 45000 })

const read = async (label) => {
  const out = await page.evaluate(() => {
    const control = document.querySelector("[data-grid-hide-fields-control]")
    const logo = document.querySelector("header a")
    const table = document.querySelector("[data-grid-table]")
    const root = document.querySelector("[data-grid-root]")
    const span = control?.querySelector("span")
    return {
      controlLabel: control?.getAttribute("aria-label"),
      controlCount: control?.getAttribute("data-grid-hidden-count"),
      controlColor: control ? getComputedStyle(control).color : null,
      controlBg: control ? getComputedStyle(control).backgroundColor : null,
      logoLeft: logo ? Math.round(logo.getBoundingClientRect().left * 100) / 100 : null,
      tableLeft: table ? Math.round(table.getBoundingClientRect().left * 100) / 100 : null,
      rootLeft: root ? Math.round(root.getBoundingClientRect().left * 100) / 100 : null,
      headers: [...document.querySelectorAll("[data-grid-column]")].map((h) => ({
        id: h.getAttribute("data-grid-column"),
        fieldType: h.getAttribute("data-grid-field-type"),
        color: getComputedStyle(h).color,
        weight: getComputedStyle(h).fontWeight,
        label: h.textContent?.trim(),
      })),
    }
  })

  console.log(`\n=== ${label}`)
  console.log(
    `  hide-fields: "${out.controlLabel}" count=${out.controlCount} color=${out.controlColor} bg=${out.controlBg}`,
  )
  console.log(`  logo left=${out.logoLeft}  grid root left=${out.rootLeft}  table left=${out.tableLeft}`)
  for (const h of out.headers) {
    console.log(
      `    ${String(h.id).padEnd(24)}${String(h.fieldType).padEnd(12)}w=${String(h.weight).padEnd(5)}${h.color.padEnd(22)}${h.label}`,
    )
  }
  return out
}

await read("as loaded (5 hidden by default)")

// Un-hide every field through the popover.
await page.locator("[data-grid-hide-fields-control]").click()
const boxes = page.locator('[data-grid-hide-fields-popover] button[role="checkbox"]')
const n = await boxes.count()
for (let i = 0; i < n; i += 1) {
  const box = boxes.nth(i)
  if ((await box.getAttribute("data-state")) === "checked") {
    await box.click()
    await page.waitForTimeout(60)
  }
}
await page.keyboard.press("Escape")
await page.waitForTimeout(300)

await read("after un-hiding every field")

await page.locator("[data-grid-root]").screenshot({ path: "/tmp/opencode/hide-none.png" })

// Hide one more and screenshot the reporting state.
await page.locator('[data-grid-column="notes"]').hover()
await page.getByRole("button", { name: "Column options for Notes" }).click()
await page.getByRole("menuitem", { name: "Hide column" }).click()
await page.waitForTimeout(400)
await read("after hiding Notes")
await page.locator("[data-grid-root]").screenshot({ path: "/tmp/opencode/hide-one.png" })

await page.screenshot({ path: "/tmp/opencode/align-page.png" })
await browser.close()