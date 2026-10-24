/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-unused-vars -- typed mock parameters */
import fs from "node:fs";
import path from "node:path";

jest.mock("server-only", () => ({}), { virtual: true });

const createBrowserClient = jest.fn(() => ({ kind: "browser" }));
const createServerClient = jest.fn((..._args: unknown[]) => ({
  kind: "server",
}));
jest.mock("@supabase/ssr", () => ({
  createBrowserClient: (...a: unknown[]) =>
    (createBrowserClient as jest.Mock)(...a),
  createServerClient: (...a: unknown[]) =>
    (createServerClient as jest.Mock)(...a),
}));
const createClient = jest.fn((...args: unknown[]) => ({ kind: "admin", args }));
jest.mock("@supabase/supabase-js", () => ({
  createClient: (...a: unknown[]) => (createClient as jest.Mock)(...a),
}));

const cookieStore = {
  getAll: jest.fn(() => [{ name: "a", value: "1" }]),
  set: jest.fn(),
};
jest.mock("next/headers", () => ({ cookies: async () => cookieStore }));

const OLD_ENV = process.env;
beforeEach(() => {
  jest.clearAllMocks();
  process.env = {
    ...OLD_ENV,
    NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-fake",
    SUPABASE_SERVICE_ROLE_KEY: "service-fake",
  };
});
afterAll(() => {
  process.env = OLD_ENV;
});

describe("browser client", () => {
  it("uses the public url and anon key", async () => {
    const { createBrowserSupabase } = await import("../client");
    createBrowserSupabase();
    expect(createBrowserClient).toHaveBeenCalledWith(
      "http://127.0.0.1:54321",
      "anon-fake",
    );
  });
});

describe("server client", () => {
  it("wires the cookie store and never uses the service role key", async () => {
    const { createServerSupabase } = await import("../server");
    await createServerSupabase();
    const [url, key, options] = createServerClient.mock.calls[0] as [
      string,
      string,
      {
        cookies: {
          getAll: () => unknown;
          setAll: (c: unknown[]) => void;
        };
      },
    ];
    expect(url).toBe("http://127.0.0.1:54321");
    expect(key).toBe("anon-fake");
    expect(options.cookies.getAll()).toEqual([{ name: "a", value: "1" }]);
    options.cookies.setAll([{ name: "b", value: "2", options: { path: "/" } }]);
    expect(cookieStore.set).toHaveBeenCalledWith("b", "2", { path: "/" });
  });

  it("tolerates cookie writes being refused (server components)", async () => {
    cookieStore.set.mockImplementationOnce(() => {
      throw new Error("read-only");
    });
    const { createServerSupabase } = await import("../server");
    await createServerSupabase();
    const options = (
      createServerClient.mock.calls[0] as unknown as [
        string,
        string,
        { cookies: { setAll: (c: unknown[]) => void } },
      ]
    )[2];
    expect(() =>
      options.cookies.setAll([{ name: "b", value: "2", options: {} }]),
    ).not.toThrow();
  });
});

describe("admin client", () => {
  it("uses the service role key without persisting a session", async () => {
    const { createAdminSupabase } = await import("../admin");
    createAdminSupabase();
    expect(createClient).toHaveBeenCalledWith(
      "http://127.0.0.1:54321",
      "service-fake",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  });

  it("imports server-only", () => {
    const source = fs.readFileSync(path.join(__dirname, "../admin.ts"), "utf8");
    expect(source).toMatch(/import\s+["']server-only["']/);
  });
});

describe("session refresh helper", () => {
  it("refreshes the session and returns a response carrying cookies", async () => {
    const getUser = jest.fn(async () => ({ data: { user: null } }));
    createServerClient.mockImplementationOnce(
      (..._args: unknown[]) => ({ auth: { getUser } }) as never,
    );
    const { updateSession } = await import("../middleware");
    const { NextRequest } = await import("next/server");
    const response = await updateSession(
      new NextRequest("http://localhost:3000/admin"),
    );
    expect(getUser).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
  });

  it("copies refreshed cookies onto the response", async () => {
    createServerClient.mockImplementationOnce(((
      _u: string,
      _k: string,
      options: {
        cookies: {
          setAll: (
            c: { name: string; value: string; options: object }[],
          ) => void;
        };
      },
    ) => ({
      auth: {
        getUser: async () => {
          options.cookies.setAll([
            { name: "sb-token", value: "fresh", options: { path: "/" } },
          ]);
          return { data: { user: null } };
        },
      },
    })) as never);
    const { updateSession } = await import("../middleware");
    const { NextRequest } = await import("next/server");
    const response = await updateSession(
      new NextRequest("http://localhost:3000/"),
    );
    expect(response.cookies.get("sb-token")?.value).toBe("fresh");
  });
});

describe("service role key containment", () => {
  function walk(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return e.name === "__tests__" ? [] : walk(p);
      return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
    });
  }

  it("is read only by src/lib/supabase/admin.ts", () => {
    const root = path.join(__dirname, "../../..");
    const readers = walk(root)
      .filter((f) => fs.readFileSync(f, "utf8").includes("SERVICE_ROLE_KEY"))
      .map((f) => path.relative(root, f));
    // env.ts names the variable in its schema, and env.d.ts only declares its type
    const allowed = [
      path.join("lib", "supabase", "admin.ts"),
      path.join("lib", "env.ts"),
      path.join("types", "env.d.ts"),
    ];
    expect(readers.filter((f) => !allowed.includes(f))).toEqual([]);
  });

  it("is never read by client-side helper files", () => {
    for (const file of ["client.ts", "server.ts", "middleware.ts"]) {
      const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
      expect(source).not.toContain("SERVICE_ROLE");
    }
  });
});
