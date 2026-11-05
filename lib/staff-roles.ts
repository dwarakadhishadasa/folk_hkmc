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

/**
 * Record comments. Every operational role may comment, but only on a record in
 * its own patch: Admin and Preacher resolve the patch to themselves, and an
 * Assistant to their assigned Admin or Preacher. `contactInPatch` is the one
 * definition of that boundary, and `contact-comments.ts` applies it on every
 * read and write because an Admin's RLS scope is the whole programme.
 *
 * Kept as its own list rather than an alias of `OPERATIONAL_ROLES` so a later
 * role added to the operational set is a deliberate decision here, not an
 * inherited widening of who can post on a record.
 */
export const CONTACT_COMMENT_ROLES: readonly StaffRole[] = ["Admin", "Preacher", "Assistant"]
