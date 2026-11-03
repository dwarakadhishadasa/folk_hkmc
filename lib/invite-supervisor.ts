import type { StaffRole } from "@hkmc/data-contracts"

/**
 * What a destination role requires of `assigned_preacher_id`.
 *
 * - Admin or Preacher: no binding; the invite clears it.
 * - Assistant: an Active Admin or Preacher.
 * - Volunteer: an Active Preacher; the binding is form routing, not a scope grant.
 */
export type SupervisorRequirement = "none" | "preacher" | "admin-or-preacher"

export function supervisorRequirementForRole(role: StaffRole): SupervisorRequirement {
  switch (role) {
    case "Admin":
    case "Preacher":
      return "none"
    case "Volunteer":
      return "preacher"
    case "Assistant":
      return "admin-or-preacher"
  }
}

export interface SupervisorCandidate {
  programId: string
  role: string
  status: string
}

export function supervisorSatisfiesRequirement(
  requirement: SupervisorRequirement,
  candidate: SupervisorCandidate | null,
  programId: string,
): boolean {
  if (requirement === "none") {
    return true
  }

  if (!candidate || candidate.status !== "Active" || candidate.programId !== programId) {
    return false
  }

  if (requirement === "preacher") {
    return candidate.role === "Preacher"
  }

  return candidate.role === "Admin" || candidate.role === "Preacher"
}

export function supervisorErrorForRequirement(requirement: SupervisorRequirement): string | null {
  switch (requirement) {
    case "none":
      return null
    case "preacher":
      return "The assigned Preacher must be an active Preacher."
    case "admin-or-preacher":
      return "The assigned Preacher must be active."
  }
}
