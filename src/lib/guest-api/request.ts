/** Reads a JSON body, returning undefined when it is missing or malformed. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

type RpcResult = { data: unknown; error: { message?: string } | null };

/**
 * Calls a database function with loose typing (the generated types may not
 * list the guest functions yet). Keeps `rpc` bound to its client.
 */
export async function callRpc(
  supabase: unknown,
  fn: string,
  args?: Record<string, unknown>,
): Promise<RpcResult> {
  const client = supabase as {
    rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<RpcResult>;
  };
  return args === undefined ? client.rpc(fn) : client.rpc(fn, args);
}
