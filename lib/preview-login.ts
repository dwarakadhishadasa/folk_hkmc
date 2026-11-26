/**
 * Preview-only password sign-in gate.
 *
 * `VERCEL_ENV === "preview"` alone is too broad: every non-production branch,
 * including `dev` and `feature/*`, is a Vercel Preview deployment. Requiring the
 * git ref keeps the route on the deployment-only `preview` branch. The local
 * override is development-only and explicit, so a deployed build cannot opt in
 * with an environment variable alone.
 */
export interface PreviewFixtureAccount {
  email: string
  role: string
}

export interface PreviewLoginEnv {
  VERCEL_ENV?: string
  VERCEL_GIT_COMMIT_REF?: string
  NODE_ENV?: string
  PREVIEW_PASSWORD_LOGIN?: string
}

export function isPreviewPasswordLoginEnabled(env: PreviewLoginEnv = process.env): boolean {
  const nodeEnv = env.NODE_ENV?.trim()
  const override = env.PREVIEW_PASSWORD_LOGIN?.trim()

  if (nodeEnv === "development" && override === "1") {
    return true
  }

  return env.VERCEL_ENV?.trim() === "preview" && env.VERCEL_GIT_COMMIT_REF?.trim() === "preview"
}
