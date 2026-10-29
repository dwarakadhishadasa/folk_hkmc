import { webcrypto } from "node:crypto"

import { afterEach, describe, expect, it, vi } from "vitest"

import { createBrowserId } from "./browser-id"

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("createBrowserId", () => {
  it("uses randomUUID when the browser exposes it", () => {
    vi.stubGlobal("crypto", {
      randomUUID: () => "11111111-2222-4333-8444-555555555555",
      getRandomValues: webcrypto.getRandomValues.bind(webcrypto),
    })

    expect(createBrowserId()).toBe("11111111-2222-4333-8444-555555555555")
  })

  it("builds a v4 id when randomUUID is absent, as on an insecure origin", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: webcrypto.getRandomValues.bind(webcrypto),
    })

    expect(createBrowserId()).toMatch(UUID_V4)
  })

  it("still produces a v4 id when crypto itself is absent", () => {
    vi.stubGlobal("crypto", undefined)

    expect(createBrowserId()).toMatch(UUID_V4)
  })

  it("produces a distinct id per call", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: webcrypto.getRandomValues.bind(webcrypto),
    })

    expect(createBrowserId()).not.toBe(createBrowserId())
  })
})
