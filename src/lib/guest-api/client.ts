/**
 * Small typed fetch wrappers for the guest API. No React, no styling: the
 * designer's frontend (or the smoke script) calls these.
 */
import type {
  ErrorBody,
  OptOutRequest,
  OptOutResponse,
  PlusOneRequest,
  RsvpResponse,
  RsvpSubmit,
  SignInRequest,
} from "./schemas";

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: ErrorBody["error"] };

export type GuestApiOptions = {
  /** Prefix for the paths, for example "http://localhost:3000". Default: same origin. */
  baseUrl?: string;
  fetch?: typeof fetch;
};

export function createGuestApiClient(options: GuestApiOptions = {}) {
  const base = options.baseUrl ?? "";
  const doFetch =
    options.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));

  async function call<T>(
    path: string,
    method: "GET" | "POST" | "PUT",
    body?: unknown,
  ): Promise<ApiResult<T>> {
    const res = await doFetch(`${base}${path}`, {
      method,
      credentials: "same-origin",
      headers:
        body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 204)
      return { ok: true, status: 204, data: undefined as T };
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      json = undefined;
    }
    if (res.status >= 200 && res.status < 300) {
      return { ok: true, status: res.status, data: json as T };
    }
    const error = (json as Partial<ErrorBody> | undefined)?.error;
    return {
      ok: false,
      status: res.status,
      error:
        error && typeof error.code === "string"
          ? error
          : { code: "unknown_error", message: "Something went wrong." },
    };
  }

  return {
    signIn: (req: SignInRequest) =>
      call<{ message: string }>("/api/guest/sign-in", "POST", req),
    signOut: () => call<undefined>("/api/guest/sign-out", "POST"),
    getRsvp: () => call<RsvpResponse>("/api/guest/rsvp", "GET"),
    submitRsvp: (req: RsvpSubmit) =>
      call<RsvpResponse>("/api/guest/rsvp", "PUT", req),
    namePlusOne: (req: PlusOneRequest) =>
      call<Record<string, unknown>>("/api/guest/plus-one", "POST", req),
    setOptOut: (optOut: OptOutRequest["opt_out"]) =>
      call<OptOutResponse>("/api/guest/opt-out", "POST", { opt_out: optOut }),
  };
}

export type GuestApiClient = ReturnType<typeof createGuestApiClient>;
