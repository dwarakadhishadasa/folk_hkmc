/**
 * The client-safe landing and redirect rules for a signed-in staff member.
 *
 * This is a UX redirect guard, not authorization: every page and handler keeps
 * its own role gate. Keeping the Assistant allowlist here means `/login`, the
 * hash callback and `/auth/confirm` cannot drift on which surfaces an Assistant
 * may be sent to.
 */
export function landingPathForRole(role?: string | null): string {
  if (role === "Volunteer") {
    return "/contact"
  }

  if (role === "Admin" || role === "Preacher" || role === "Assistant") {
    return "/dashboard"
  }

  return "/"
}

const ASSISTANT_ALLOWED_PREFIXES = [
  "/dashboard",
  "/sessions",
  "/contact",
  "/contacts",
  "/manage",
  "/campaigns",
] as const

export function assistantPathAllowed(value: string): boolean {
  const path = value.split("?")[0] ?? value
  return ASSISTANT_ALLOWED_PREFIXES.some(
    (allowed) => path === allowed || path.startsWith(`${allowed}/`),
  )
}

export function safeStaffRedirectPath(
  value: string | null | undefined,
  role?: string | null,
): string {
  if (value?.startsWith("/") && !value.startsWith("//") && !value.startsWith("/auth")) {
    if (role === "Volunteer" && value !== "/contact") {
      return "/contact"
    }

    if (role === "Assistant" && !assistantPathAllowed(value)) {
      return "/dashboard"
    }

    return value
  }

  return landingPathForRole(role)
}
