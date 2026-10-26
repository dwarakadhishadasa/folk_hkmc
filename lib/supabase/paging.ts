/**
 * PostgREST answers a read with at most 1,000 rows, so a full final page means
 * the result was truncated. AD-16: concatenate pages and fail loudly rather
 * than return a short list.
 */
export const POSTGREST_PAGE_SIZE = 1000
export const POSTGREST_MAX_PAGES = 50

export interface PostgrestPage {
  data: unknown
  error: unknown
}

export interface PagingFailures {
  read: () => Error
  truncated: () => Error
}

export async function collectPagedRows<T>(
  fetchPage: (from: number, to: number) => Promise<PostgrestPage>,
  failures: PagingFailures,
): Promise<T[]> {
  const rows: T[] = []

  for (let page = 0; page < POSTGREST_MAX_PAGES; page += 1) {
    const from = page * POSTGREST_PAGE_SIZE
    const { data, error } = await fetchPage(from, from + POSTGREST_PAGE_SIZE - 1)

    if (error) {
      throw failures.read()
    }

    const pageRows = Array.isArray(data) ? (data as T[]) : []
    rows.push(...pageRows)

    if (pageRows.length < POSTGREST_PAGE_SIZE) {
      return rows
    }
  }

  throw failures.truncated()
}
