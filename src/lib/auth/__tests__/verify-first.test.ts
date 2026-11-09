/**
 * @jest-environment node
 *
 * Verify-first checks for the household sign-in design (research R1 and R2).
 * They run against the local Supabase and are skipped when it is not running
 * (`npm run db:start`). Fake data only.
 */
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.LOCAL_SUPABASE_URL ?? "http://127.0.0.1:54321";
// The well-known keys of the local development stack, not secrets.
const serviceKey =
  process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const anonKey =
  process.env.LOCAL_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

async function isRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: anonKey },
    });
    return res.ok;
  } catch {
    return false;
  }
}

describe("household Auth user verify-first checks", () => {
  let running = false;
  const email = `household-${randomUUID()}@households.invalid`;
  let userId: string | undefined;
  const admin = () =>
    createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

  beforeAll(async () => {
    running = await isRunning();
  });

  afterAll(async () => {
    if (running && userId) await admin().auth.admin.deleteUser(userId);
  });

  it("R2: accepts a .invalid address for a confirmed user", async () => {
    if (!running) return;
    const { data, error } = await admin().auth.admin.createUser({
      email,
      email_confirm: true,
    });
    expect(error).toBeNull();
    expect(data.user?.email).toBe(email);
    userId = data.user?.id;
  });

  it("R1: generateLink gives a token that verifyOtp turns into a session", async () => {
    if (!running || !userId) return;
    const { data, error } = await admin().auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    expect(error).toBeNull();
    const tokenHash = data?.properties?.hashed_token;
    expect(typeof tokenHash).toBe("string");

    const server = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const verified = await server.auth.verifyOtp({
      token_hash: tokenHash!,
      type: "email",
    });
    expect(verified.error).toBeNull();
    expect(verified.data.session?.access_token).toBeTruthy();
    expect(verified.data.user?.id).toBe(userId);
  });
});
