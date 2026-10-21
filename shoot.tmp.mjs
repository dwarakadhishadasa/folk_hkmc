#!/usr/bin/env node
/**
 * shoot.mjs — capture the app at a phone viewport, as a human would see it.
 *
 * Uses the e2e storage state so the page is authenticated; it is a screenshot
 * harness, not a test run.
 */
import { chromium } from "@playwright/test"
import { mkdirSync } from "node:fs"

const OUT = "/tmp/opencode/shots"
mkdirSync(OUT, { recursive: true })

const [, , url, name, widthArg, heightArg, ...actions] = process.argv
const width = Number(widthArg ?? 390)
const height = Number(heightArg ?? 844)

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width, height },
  storageState: "/home/dwarakadhisha-dasa/projects/hkmc/folk_hkmc/e2e/.auth/admin.json",
  deviceScaleFactor: 2,
})
const page = await context.newPage()
page.on("console", (m) => {
  if (m.type() === "error") console.log("[console.error]", m.text())
})
page.on("pageerror", (e) => console.log("[pageerror]", e.message))

await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 })
await page.waitForTimeout(1200)

for (const action of actions) {
  const [kind, ...rest] = action.split(":")
  const arg = rest.join(":")
  try {
    if (kind === "click") await page.locator(arg).first().click({ timeout: 10_000 })
    else if (kind === "clicktext") await page.getByText(arg, { exact: false }).first().click({ timeout: 10_000 })
    else if (kind === "wait") await page.waitForTimeout(Number(arg))
    else if (kind === "press") await page.keyboard.press(arg)
    await page.waitForTimeout(500)
  } catch (e) {
    console.log("[action failed]", action, e.message.split("\n")[0])
  }
}

await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false })
console.log("wrote", `${OUT}/${name}.png`)
await browser.close()
