import type { z } from "zod";
import {
  sendCampaignResponseSchema,
  type SendCampaignResponse,
} from "./campaign-schemas";
import {
  grantStaffResponseSchema,
  type GrantStaffRequest,
  type GrantStaffResponse,
} from "./staff-schemas";
import {
  createHouseholdResponseSchema,
  errorBodySchema,
  importResponseSchema,
  updateHouseholdResponseSchema,
  type CreateHouseholdRequest,
  type CreateHouseholdResponse,
  type ErrorBody,
  type ImportResponse,
  type UpdateHouseholdRequest,
  type UpdateHouseholdResponse,
} from "./schemas";

/**
 * Small typed fetch wrappers for the admin frontend. Same-origin, cookie
 * session; no React and no styling. Every call resolves to a result object
 * and never throws.
 */

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: ErrorBody["error"] };

async function call<S extends z.ZodType>(
  schema: S | null,
  path: string,
  init: RequestInit,
): Promise<ApiResult<z.infer<S> | null>> {
  let response: Response;
  try {
    response = await fetch(path, { credentials: "same-origin", ...init });
  } catch {
    return {
      ok: false,
      status: 0,
      error: { code: "network", message: "The request could not be sent." },
    };
  }
  const body: unknown = await response.json().catch(() => null);
  if (response.ok) {
    if (!schema) return { ok: true, data: null };
    const parsed = schema.safeParse(body);
    return parsed.success
      ? { ok: true, data: parsed.data }
      : {
          ok: false,
          status: response.status,
          error: {
            code: "bad_response",
            message: "The response was not understood.",
          },
        };
  }
  const err = errorBodySchema.safeParse(body);
  return {
    ok: false,
    status: response.status,
    error: err.success
      ? err.data.error
      : { code: "unknown", message: "The request failed." },
  };
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export const createHousehold = (body: CreateHouseholdRequest) =>
  call(
    createHouseholdResponseSchema,
    "/api/admin/households",
    json("POST", body),
  ) as Promise<ApiResult<CreateHouseholdResponse>>;

export const updateHousehold = (id: string, body: UpdateHouseholdRequest) =>
  call(
    updateHouseholdResponseSchema,
    `/api/admin/households/${encodeURIComponent(id)}`,
    json("PATCH", body),
  ) as Promise<ApiResult<UpdateHouseholdResponse>>;

export const deleteHousehold = (id: string) =>
  call(null, `/api/admin/households/${encodeURIComponent(id)}`, {
    method: "DELETE",
  }) as Promise<ApiResult<null>>;

/** Sends the CSV text as the request body. */
export const importGuests = (csv: string) =>
  call(importResponseSchema, "/api/admin/guests/import", {
    method: "POST",
    headers: { "content-type": "text/csv" },
    body: csv,
  }) as Promise<ApiResult<ImportResponse>>;

const XLSX_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Sends a `.xlsx` or `.csv` file's bytes; the type comes from the file name. */
export const importGuestsFile = (file: File) =>
  call(importResponseSchema, "/api/admin/guests/import", {
    method: "POST",
    headers: {
      "content-type": file.name.toLowerCase().endsWith(".xlsx")
        ? XLSX_TYPE
        : "text/csv",
    },
    body: file,
  }) as Promise<ApiResult<ImportResponse>>;

/** Asks for a staff sign-in link. Always 202 with a neutral message. */
export const requestStaffSignIn = (email: string) =>
  call(null, "/api/admin/sign-in", json("POST", { email })) as Promise<
    ApiResult<null>
  >;

export const sendCampaign = (id: string) =>
  call(
    sendCampaignResponseSchema,
    `/api/admin/campaigns/${encodeURIComponent(id)}/send`,
    { method: "POST" },
  ) as Promise<ApiResult<SendCampaignResponse>>;

export const grantStaff = (body: GrantStaffRequest) =>
  call(
    grantStaffResponseSchema,
    "/api/admin/staff",
    json("POST", body),
  ) as Promise<ApiResult<GrantStaffResponse>>;

export const revokeStaff = (userId: string) =>
  call(null, `/api/admin/staff/${encodeURIComponent(userId)}`, {
    method: "DELETE",
  }) as Promise<ApiResult<null>>;
