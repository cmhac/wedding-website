/** @jest-environment node */
import { z } from "zod";
import { errorResponse, validationError } from "../api-errors";

describe("errorResponse", () => {
  it("uses the shared error shape", async () => {
    const res = errorResponse(409, "email_in_use", "Already used.");
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: { code: "email_in_use", message: "Already used." },
    });
  });
});

describe("validationError", () => {
  it("answers 422 with issues carrying path and message only", async () => {
    const result = z.object({ a: z.string() }).safeParse({ a: 1 });
    if (result.success) throw new Error("expected failure");
    const res = validationError(result.error);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("invalid_request");
    expect(body.error.issues[0].path).toEqual(["a"]);
    expect(Object.keys(body.error.issues[0]).sort()).toEqual([
      "message",
      "path",
    ]);
  });
});
