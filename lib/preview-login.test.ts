import { describe, expect, it } from "vitest"

import { isPreviewPasswordLoginEnabled } from "./preview-login"

describe("isPreviewPasswordLoginEnabled", () => {
  it("enables the preview branch deployment", () => {
    expect(
      isPreviewPasswordLoginEnabled({
        VERCEL_ENV: "preview",
        VERCEL_GIT_COMMIT_REF: "preview",
      }),
    ).toBe(true)
  })

  it("stays off on dev and feature branch previews", () => {
    expect(
      isPreviewPasswordLoginEnabled({
        VERCEL_ENV: "preview",
        VERCEL_GIT_COMMIT_REF: "dev",
      }),
    ).toBe(false)

    expect(
      isPreviewPasswordLoginEnabled({
        VERCEL_ENV: "preview",
        VERCEL_GIT_COMMIT_REF: "feature/preview-login",
      }),
    ).toBe(false)
  })

  it("stays off in production even when the branch is named preview", () => {
    expect(
      isPreviewPasswordLoginEnabled({
        VERCEL_ENV: "production",
        VERCEL_GIT_COMMIT_REF: "preview",
      }),
    ).toBe(false)
  })

  it("allows an explicit local development override", () => {
    expect(
      isPreviewPasswordLoginEnabled({
        NODE_ENV: "development",
        PREVIEW_PASSWORD_LOGIN: "1",
      }),
    ).toBe(true)
  })

  it("does not let a deployed build opt in with the local override", () => {
    expect(
      isPreviewPasswordLoginEnabled({
        NODE_ENV: "production",
        PREVIEW_PASSWORD_LOGIN: "1",
      }),
    ).toBe(false)
  })

  it("fails closed when the environment cannot identify the deployment", () => {
    expect(isPreviewPasswordLoginEnabled({})).toBe(false)
  })
})
