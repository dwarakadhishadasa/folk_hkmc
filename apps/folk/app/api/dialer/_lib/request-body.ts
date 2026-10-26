import { AuthzError } from "@/lib/authz"

/**
 * A body that is not a JSON object is a caller mistake, not a server fault: the
 * parse failure becomes `400 invalid_body` instead of the handler's 500 arm.
 */
export async function readJsonBody(request: Request): Promise<unknown> {
  let payload: unknown

  try {
    payload = await request.json()
  } catch {
    throw new AuthzError(400, "invalid_body", "Request body must be valid JSON.")
  }

  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new AuthzError(400, "invalid_body", "Request body must be a JSON object.")
  }

  return payload
}
