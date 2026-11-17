import { computeUpcomingBirthdays, type UpcomingBirthday } from "@/lib/dashboard/birthdays"
import type { DashboardScope } from "@/lib/dashboard/types"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

/**
 * The next birthdays for the patch the reader is looking at.
 *
 * The query is the same patch predicate the dashboard's other reads use:
 * contacts assigned to the preacher (an Assistant resolves through the owner).
 * An Admin reading the whole programme has no single patch, so the section is
 * skipped rather than widened to every contact.
 */
export async function loadUpcomingBirthdays(
  scope: DashboardScope,
  today: string,
): Promise<UpcomingBirthday[]> {
  if (scope.programScope || !scope.scopePreacherId) {
    return []
  }

  const supabaseAdmin = createSupabaseAdminClient()
  const { data, error } = await supabaseAdmin
    .from("contacts")
    .select("id,name,date_of_birth")
    .eq("program_id", scope.programId)
    .eq("assigned_preacher_id", scope.scopePreacherId)
    .not("date_of_birth", "is", null)

  if (error) {
    console.error("[dashboard] birthdays failed", error)
    throw new Error("Unable to read the upcoming birthdays.")
  }

  return computeUpcomingBirthdays(
    (data ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.name ?? ""),
      dateOfBirth: row.date_of_birth ? String(row.date_of_birth) : null,
    })),
    today,
  )
}
