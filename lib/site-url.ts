import "server-only"

function cleanEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) {
    return undefined
  }

  return trimmed.replace(/^["']|["']$/g, "")
}

function vercelUrl(value: string | undefined): string | undefined {
  const cleaned = cleanEnv(value)
  if (!cleaned) {
    return undefined
  }

  return cleaned.startsWith("http") ? cleaned : `https://${cleaned}`
}

function firstValidUrl(candidates: Array<[string, string | undefined]>): string {
  for (const [, rawValue] of candidates) {
    const value = cleanEnv(rawValue)
    if (!value) {
      continue
    }

    try {
      return new URL(value).toString().replace(/\/$/, "")
    } catch {
      continue
    }
  }

  const names = candidates.map(([name]) => name).join(" or ")
  throw new Error(`${names} must contain a valid app URL`)
}

function requestOrigin(request: Request | undefined): string | undefined {
  if (!request) {
    return undefined
  }

  try {
    const origin = new URL(request.url).origin
    return origin.startsWith("http://") || origin.startsWith("https://") ? origin : undefined
  } catch {
    return undefined
  }
}

export function getPublicSiteUrl(request?: Request): string {
  return firstValidUrl([
    ["request URL origin", requestOrigin(request)],
    ["NEXT_PUBLIC_SITE_URL", process.env.NEXT_PUBLIC_SITE_URL],
    ["SITE_URL", process.env.SITE_URL],
    ["NEXT_PUBLIC_VERCEL_URL", vercelUrl(process.env.NEXT_PUBLIC_VERCEL_URL)],
    ["VERCEL_URL", vercelUrl(process.env.VERCEL_URL)],
  ])
}

export function getAuthConfirmRedirectUrl(request?: Request): string {
  return `${getPublicSiteUrl(request)}/auth/confirm`
}
