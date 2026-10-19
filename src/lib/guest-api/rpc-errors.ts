import { errorResponse } from "@/lib/api-errors";

type Mapped = { status: number; message: string };

const MAP: Record<string, Mapped> = {
  not_a_guest: { status: 403, message: "You do not have access to this." },
  forbidden: { status: 403, message: "You do not have access to this." },
  rsvp_closed: { status: 409, message: "RSVPs are closed. Please contact us." },
  not_a_placeholder: {
    status: 409,
    message: "That place has already been filled.",
  },
  invalid_meal: { status: 422, message: "That meal choice is not available." },
  invalid_payload: { status: 422, message: "The request is not valid." },
};

/**
 * Maps a database error from a guest RPC to the contract's HTTP response.
 * The functions raise stable codes; the code is found in the error message,
 * details, or hint. Anything else is a 500 with no database text.
 */
export function rpcErrorResponse(error: {
  message?: string;
  details?: string | null;
  hint?: string | null;
}): Response {
  const text = [error.message, error.details, error.hint].join(" ");
  const code = Object.keys(MAP).find((c) =>
    new RegExp(`\\b${c}\\b`).test(text),
  );
  if (code) return errorResponse(MAP[code].status, code, MAP[code].message);
  return errorResponse(500, "server_error", "Something went wrong.");
}
