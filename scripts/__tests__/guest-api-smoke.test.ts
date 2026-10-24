/** @jest-environment node */
import {
  CookieJar,
  extractSignInLink,
  main,
  summarise,
} from "../guest-api-smoke";

describe("extractSignInLink", () => {
  it("finds the first http link in the mail text", () => {
    const text =
      "Hello\nOpen http://127.0.0.1:54321/auth/v1/verify?token=abc&type=magiclink now";
    expect(extractSignInLink(text)).toBe(
      "http://127.0.0.1:54321/auth/v1/verify?token=abc&type=magiclink",
    );
  });

  it("decodes html-escaped ampersands and returns null when absent", () => {
    expect(extractSignInLink("see http://x.test/a?b=1&amp;c=2 ok")).toBe(
      "http://x.test/a?b=1&c=2",
    );
    expect(extractSignInLink("no link here")).toBeNull();
  });
});

describe("CookieJar", () => {
  it("keeps name=value pairs, overwrites repeats, and drops attributes", () => {
    const jar = new CookieJar();
    jar.store(["sb-a=1; Path=/; HttpOnly", "sb-b=2; Path=/"]);
    jar.store(["sb-a=3; Path=/"]);
    expect(jar.header()).toBe("sb-a=3; sb-b=2");
  });

  it("removes a cookie set to an empty value", () => {
    const jar = new CookieJar();
    jar.store(["sb-a=1"]);
    jar.store(["sb-a=; Max-Age=0"]);
    expect(jar.header()).toBe("");
  });
});

describe("summarise", () => {
  it("prints step outcomes only", () => {
    const out = summarise([
      { step: "sign-in neutral", pass: true, detail: "202" },
      { step: "deadline", pass: false, detail: "got 200" },
    ]);
    expect(out).toContain("PASS sign-in neutral (202)");
    expect(out).toContain("FAIL deadline (got 200)");
  });
});

describe("main: sign-in cookies", () => {
  it("keeps the known address's sign-in cookie when an unknown address is also tried", async () => {
    // A fake app: every sign-in request sets a code-verifier cookie unique to
    // that request, and the callback only succeeds with the known one's.
    let counter = 0;
    let knownVerifier = "";
    let callbackCookie = "";
    const fakeFetch = jest.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const headers = new Headers(init?.headers);
        if (url.endsWith("/api/guest/sign-in")) {
          const email = JSON.parse(String(init?.body)).email as string;
          const verifier = `v${++counter}`;
          if (email === "known@example.test") knownVerifier = verifier;
          const res = new Response(JSON.stringify({ message: "neutral" }), {
            status: 202,
            headers: { "content-type": "application/json" },
          });
          res.headers.append("set-cookie", `verifier=${verifier}; Path=/`);
          return res;
        }
        if (url.includes("/api/v1/search")) {
          return Response.json({ messages: [{ ID: "m1" }] });
        }
        if (url.includes("/api/v1/message/")) {
          return Response.json({
            Text: "Open http://app.test/auth/callback?code=c1",
          });
        }
        if (url.includes("/auth/callback")) {
          callbackCookie = headers.get("cookie") ?? "";
          return new Response(null, {
            status: 302,
            headers: { location: "/rsvp" },
          });
        }
        return new Response(null, { status: 401 });
      },
    );
    const realFetch = global.fetch;
    global.fetch = fakeFetch as unknown as typeof fetch;
    process.env.GUEST_SMOKE_EMAIL = "known@example.test";
    process.env.GUEST_SMOKE_BASE_URL = "http://app.test";
    const write = jest
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    try {
      await main();
    } finally {
      global.fetch = realFetch;
      write.mockRestore();
      process.exitCode = 0;
    }
    expect(callbackCookie).toContain(`verifier=${knownVerifier}`);
  });
});

describe("main: deadline check", () => {
  it("asks for a change to the stored answer, since resending it is allowed", async () => {
    const GUEST = "g1";
    const CLOSED = "e-closed";
    const closedPuts: string[] = [];
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    const fakeFetch = jest.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        if (url.endsWith("/api/guest/sign-in"))
          return json(202, { message: "n" });
        if (url.includes("/api/v1/search"))
          return json(200, { messages: [{ ID: "m" }] });
        if (url.includes("/api/v1/message/"))
          return json(200, {
            Text: "Open http://app.test/auth/callback?code=c",
          });
        if (url.includes("/auth/callback"))
          return new Response(null, {
            status: 302,
            headers: { location: "/rsvp" },
          });
        if (url.endsWith("/api/guest/rsvp") && method === "GET")
          return json(200, {
            guests: [
              {
                id: GUEST,
                is_placeholder: false,
                invitations: [
                  { status: "attending", event: { id: CLOSED, closed: true } },
                ],
              },
            ],
          });
        if (url.endsWith("/api/guest/rsvp") && method === "PUT") {
          const body = JSON.parse(String(init?.body));
          const sent = body.guests[0].responses?.[0];
          if (sent?.event_id === CLOSED) {
            closedPuts.push(sent.status);
            // The server only refuses a change to the stored answer.
            return sent.status === "attending"
              ? json(200, {})
              : json(409, { error: { code: "rsvp_closed" } });
          }
          return json(200, {});
        }
        if (url.endsWith("/api/guest/opt-out")) return json(200, {});
        if (url.endsWith("/api/guest/sign-out"))
          return new Response(null, { status: 204 });
        return json(401, {});
      },
    );
    const realFetch = global.fetch;
    global.fetch = fakeFetch as unknown as typeof fetch;
    process.env.GUEST_SMOKE_EMAIL = "known@example.test";
    process.env.GUEST_SMOKE_BASE_URL = "http://app.test";
    process.env.GUEST_SMOKE_CLOSED_EVENT_ID = CLOSED;
    let output = "";
    const write = jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk) => {
        output += String(chunk);
        return true;
      });
    try {
      await main();
    } finally {
      global.fetch = realFetch;
      write.mockRestore();
      delete process.env.GUEST_SMOKE_CLOSED_EVENT_ID;
      process.exitCode = 0;
    }
    expect(closedPuts).toEqual(["declined"]);
    expect(output).toContain("PASS answers after the deadline are refused");
  });
});
