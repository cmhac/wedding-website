import type { ZodError } from "zod";

/** The JSON error shape shared by the guest and admin APIs. */
export function errorResponse(
  status: number,
  code: string,
  message: string,
  issues?: { path: PropertyKey[]; message: string }[],
) {
  return Response.json(
    { error: { code, message, ...(issues ? { issues } : {}) } },
    { status },
  );
}

/** A 422 for a request body that failed validation. Issues never echo submitted values. */
export function validationError(error: ZodError) {
  return errorResponse(
    422,
    "invalid_request",
    "The request is not valid.",
    error.issues.map((i) => ({ path: i.path, message: i.message })),
  );
}
