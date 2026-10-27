/**
 * `lib/site-url.ts` resolves the app's public origin from five candidates, in
 * priority order, with a trim/quote clean and a throw when none survive.
 *
 * This is unit-testable precisely because it is pure: no Supabase client, no
 * request context. The e2e suite only ever reaches it through a page render, so
 * the throw path and the Vercel fallbacks have no other cover.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { getAuthConfirmRedirectUrl, getPublicSiteUrl } from "@/lib/site-url"

const ENV_KEYS = ["NEXT_PUBLIC_SITE_URL", "SITE_URL", "NEXT_PUBLIC_VERCEL_URL", "VERCEL_URL"] as const

/** Snapshot of the real environment, so a stubbed run cannot leak into another file. */
let savedEnv: Map<string, string | undefined>

beforeEach(() => {
  savedEnv = new Map()
  for (const key of ENV_KEYS) {
    savedEnv.set(key, process.env[key])
    delete process.env[key]
  }
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = savedEnv.get(key)
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
})

describe("getPublicSiteUrl", () => {
  it("takes the request origin, which outranks every environment variable", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://from-env.example.org"

    expect(getPublicSiteUrl(new Request("https://from-request.example.org/some/path"))).toBe(
      "https://from-request.example.org",
    )
  })

  it("falls back to NEXT_PUBLIC_SITE_URL before SITE_URL", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://public.example.org"
    process.env.SITE_URL = "https://site.example.org"

    expect(getPublicSiteUrl()).toBe("https://public.example.org")
  })

  it("trims surrounding whitespace and quotes, and strips a trailing slash", () => {
    process.env.NEXT_PUBLIC_SITE_URL = '  "https://folk.example.org/"  '

    expect(getPublicSiteUrl()).toBe("https://folk.example.org")
  })

  it("gives a bare VERCEL_URL an https scheme", () => {
    process.env.VERCEL_URL = "folk-hkmc.vercel.app"

    expect(getPublicSiteUrl()).toBe("https://folk-hkmc.vercel.app")
  })

  it("skips a candidate that is not parseable rather than throwing early", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "not a url"
    process.env.SITE_URL = "https://fallback.example.org"

    expect(getPublicSiteUrl()).toBe("https://fallback.example.org")
  })

  it("names every candidate when none of them resolve", () => {
    expect(() => getPublicSiteUrl()).toThrow(
      "request URL origin or NEXT_PUBLIC_SITE_URL or SITE_URL or NEXT_PUBLIC_VERCEL_URL or VERCEL_URL must contain a valid app URL",
    )
  })

  it("ignores a request whose URL is unparseable", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://from-env.example.org"

    // Node's `Request` refuses to construct with an invalid URL, so the guard in
    // `requestOrigin` is only reachable from a caller that hands over a
    // duck-typed object. The cast reaches the branch; it is not a shortcut.
    const malformedRequest = { url: "not a url" } as unknown as Request

    expect(getPublicSiteUrl(malformedRequest)).toBe("https://from-env.example.org")
  })
})

describe("getAuthConfirmRedirectUrl", () => {
  it("appends the confirm path to the resolved origin", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://folk.example.org/"

    expect(getAuthConfirmRedirectUrl()).toBe("https://folk.example.org/auth/confirm")
  })
})
