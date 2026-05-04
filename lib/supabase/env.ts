function cleanEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) {
    return undefined
  }

  return trimmed.replace(/^["']|["']$/g, "")
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
