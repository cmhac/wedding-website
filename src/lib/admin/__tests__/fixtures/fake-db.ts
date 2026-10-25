/**
 * Fake Supabase client for the admin console tests. It builds on the campaign
 * fake and adds the query shapes the console uses: order, in, ilike, range,
 * single, maybeSingle, delete, update without a returned row, rpc with canned
 * results and recorded calls, and failNext(name, { message }) to inject one
 * error. Fake data only (example.test addresses, invented names).
 */
import {
  createFakeDb,
  type FakeDb,
} from "@/lib/campaigns/__tests__/fixtures/fake-db";

type Row = Record<string, unknown>;

export type AdminFakeDb = FakeDb;

export function createAdminFakeDb(
  initial: Record<string, Row[]> = {},
  options: {
    rpcs?: Record<string, (args: Row) => unknown>;
    rpcResults?: Record<
      string,
      { data?: unknown; error?: { code?: string; message?: string } }
    >;
  } = {},
): AdminFakeDb {
  return createFakeDb(initial, options.rpcs, {
    rpcResults: options.rpcResults,
    strictSingle: true,
  });
}
