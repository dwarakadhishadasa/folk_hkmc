function cleanEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) {
    return undefined
  }

  return trimmed.replace(/^["']|["']$/g, "")
}

function isVercelDeployment(): boolean {
  return cleanEnv(process.env.VERCEL) === "1" || Boolean(cleanEnv(process.env.VERCEL_ENV))
}

function isLoopbackUrl(url: URL): boolean {
  return ["127.0.0.1", "localhost", "::1"].includes(url.hostname)
}

function firstValidUrl(candidates: Array<[string, string | undefined]>): string {
  const skippedLoopbackNames: string[] = []

  for (const [, rawValue] of candidates) {
    const value = cleanEnv(rawValue)
    if (!value) {
      continue
    }

    try {
      const url = new URL(value)
      if (isVercelDeployment() && isLoopbackUrl(url)) {
        skippedLoopbackNames.push(value)
        continue
      }

      return url.toString().replace(/\/$/, "")
    } catch {
      continue
    }
  }

  const names = candidates.map(([name]) => name).join(" or ")
  if (skippedLoopbackNames.length > 0) {
    throw new Error(`${names} must not point to local Supabase when deployed on Vercel`)
  }

  throw new Error(`${names} must contain a valid Supabase URL`)
}

function firstValue(candidates: Array<[string, string | undefined]>): string {
  for (const [, rawValue] of candidates) {
    const value = cleanEnv(rawValue)
    if (value) {
      return value
    }
  }

  const names = candidates.map(([name]) => name).join(" or ")
  throw new Error(`${names} is required`)
}

export function getSupabasePublicUrl(): string {
  return firstValidUrl([
    ["NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL],
    ["SUPABASE_URL", process.env.SUPABASE_URL],
  ])
}

export function getSupabaseBrowserKey(): string {
  return firstValue([
    ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY],
    ["NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY],
  ])
}

export function getSupabaseServerPublicKey(): string {
  return firstValue([
    ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY],
    ["SUPABASE_PUBLISHABLE_KEY", process.env.SUPABASE_PUBLISHABLE_KEY],
    ["NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY],
  ])
}

export function getSupabaseServiceRoleKey(): string {
  return firstValue([["SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY]])
}
