import type { StaffRole } from "@hkmc/data-contracts"

/**
 * One role set per surface family. A page and its handlers read the same
 * constant, so a surface cannot admit a role its write API refuses.
 */
export const OPERATIONAL_ROLES: readonly StaffRole[] = ["Admin", "Preacher", "Assistant"]

export const CAMPAIGN_ADMIN_ROLES: readonly StaffRole[] = ["Admin", "Preacher", "Assistant"]

export const CONTACT_FORM_ROLES: readonly StaffRole[] = ["Admin", "Preacher", "Volunteer", "Assistant"]

/** `/volunteers` is the Preacher's self-only surface; an Admin invites from `/admin/invite`. */
export const VOLUNTEER_INVITE_ROLES: readonly StaffRole[] = ["Preacher"]

export const STAFF_ADMIN_ROLES: readonly StaffRole[] = ["Admin"]

/**
 * The manage contact write gate. Kept as its own name so a test can assert it
 * is `OPERATIONAL_ROLES` rather than a second list that happens to agree today.
 */
export const MANAGE_CONTACT_WRITE_ROLES: readonly StaffRole[] = OPERATIONAL_ROLES
