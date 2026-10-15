/**
 * Story 8 (CAP-1) visual validation. NOT a Playwright test — this launches a
 * browser with the seeded admin session and writes a screenshot, so the
 * readiness-gated suite and its shared database are never touched.
 */
import { chromium } from "@playwright/test"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const out = process.argv[2] ?? path.join(repoRoot, ".story8-shots")
const url = process.argv[3] ?? "http://127.0.0.1:3000/manage?view=contacts&mode=admin"

const browser = await chromium.launch()
const context = await browser.newContext({
  storageState: path.join(repoRoot, "e2e/.auth/admin.json"),
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
})
const page = await context.newPage()
const errors = []
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`))
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console.error: ${message.text()}`)
})

await page.goto(url, { waitUntil: "networkidle" })
// The grid virtualizes: wait for a stable rendered row count before shooting.
await page.waitForSelector("[data-grid-root]", { timeout: 30000 }).catch(() => {})
await page.waitForFunction(
  () => document.querySelectorAll("[data-grid-row]").length > 0,
  null,
  { timeout: 30000 },
).catch(() => {})
await page.waitForTimeout(1500)

await page.screenshot({ path: path.join(out, "manage-contacts-1440x900.png"), fullPage: false })

// The dashboard tab is the landing view; shoot it too since the header is shared.
await page.goto("http://127.0.0.1:3000/manage?view=dashboard&mode=admin", { waitUntil: "networkidle" })
await page.waitForTimeout(1500)
await page.screenshot({ path: path.join(out, "manage-dashboard-1440x900.png"), fullPage: false })

// Dark mode: the active tab's colour must survive .dark, where the shadcn
// trigger's own dark variants would otherwise win on specificity.
await page.goto(url, { waitUntil: "networkidle" })
await page.waitForSelector("[data-grid-root]")
await page.waitForTimeout(1200)
const toggle = page.getByRole("button", { name: "Toggle theme" })
if (await toggle.count()) {
  await toggle.first().click()
  await page.waitForTimeout(1200)
}
await page.screenshot({ path: path.join(out, "manage-contacts-dark-1440x900.png"), fullPage: false })

// Preacher mode: the Badge branch plus the scope notice, and the tab strip under it.
const preacherContext = await browser.newContext({
  storageState: path.join(repoRoot, "e2e/.auth/preacher.json"),
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
})
const preacherPage = await preacherContext.newPage()
await preacherPage.goto("http://127.0.0.1:3000/manage?view=contacts&mode=preacher", { waitUntil: "networkidle" })
await preacherPage.waitForSelector("[data-grid-root]").catch(() => {})
await preacherPage.waitForTimeout(1500)
await preacherPage.screenshot({ path: path.join(out, "manage-contacts-preacher-1440x900.png"), fullPage: false })
await preacherContext.close()

await browser.close()
console.log(JSON.stringify({ shots: out, errors }, null, 2))
