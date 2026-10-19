/**
 * End-to-end smoke test of the guest API against the local stack. It stands
 * in for the designer's frontend during validation.
 *
 * Usage (stack running, app running with `npm run dev`):
 *   GUEST_SMOKE_EMAIL=<seeded household email> node --env-file=.env.local scripts/guest-api-smoke.ts
 *
 * Optional environment:
 *   GUEST_SMOKE_BASE_URL   app URL (default http://localhost:3000)
 *   GUEST_SMOKE_MAIL_URL   Mailpit URL (default http://127.0.0.1:54324)
 *   GUEST_SMOKE_CLOSED_EVENT_ID  id of an event whose deadline has passed; enables the deadline check
 *
 * Prints step outcomes only, never names or email addresses.
 */

export type StepResult = { step: string; pass: boolean; detail: string };

/** First http(s) link in a mail body, with html-escaped ampersands decoded. */
export function extractSignInLink(text: string): string | null {
  const match = /https?:\/\/[^\s"'<>]+/.exec(text);
  return match ? match[0].replace(/&amp;/g, "&") : null;
}

/** Minimal cookie store for following the sign-in redirects. */
export class CookieJar {
  private cookies = new Map<string, string>();

  store(setCookie: string[]) {
    for (const line of setCookie) {
      const pair = line.split(";")[0];
      const i = pair.indexOf("=");
      if (i < 1) continue;
      const name = pair.slice(0, i).trim();
      const value = pair.slice(i + 1).trim();
      if (value === "") this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  header(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

export function summarise(results: StepResult[]): string {
  return results
    .map((r) => `${r.pass ? "PASS" : "FAIL"} ${r.step} (${r.detail})`)
    .join("\n");
}

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function main() {
  const base = process.env.GUEST_SMOKE_BASE_URL ?? "http://localhost:3000";
  const mail = process.env.GUEST_SMOKE_MAIL_URL ?? "http://127.0.0.1:54324";
  const email = process.env.GUEST_SMOKE_EMAIL;
  const closedEvent = process.env.GUEST_SMOKE_CLOSED_EVENT_ID;
  if (!email) {
    throw new Error("Set GUEST_SMOKE_EMAIL to a seeded household email.");
  }

  const results: StepResult[] = [];
  const record = (step: string, pass: boolean, detail: string) => {
    results.push({ step, pass, detail });
    return pass;
  };
  const jar = new CookieJar();

  async function api(path: string, method: string, body?: unknown) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        cookie: jar.header(),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    });
    jar.store(res.headers.getSetCookie());
    const json: Json | null =
      res.status === 204 ? null : await res.json().catch(() => null);
    return { status: res.status, json };
  }

  async function latestMailTo(address: string): Promise<string | null> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const list = (await (
        await fetch(
          `${mail}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`,
        )
      ).json()) as Json;
      const id = list.messages?.[0]?.ID;
      if (id) {
        const msg = (await (
          await fetch(`${mail}/api/v1/message/${id}`)
        ).json()) as Json;
        return `${msg.Text ?? ""}\n${msg.HTML ?? ""}`;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    return null;
  }

  // 1. Sign-in answers identically for a known and an unknown address.
  const known = await api("/api/guest/sign-in", "POST", { email });
  const unknown = await api("/api/guest/sign-in", "POST", {
    email: "nobody-on-the-list@example.invalid",
  });
  record(
    "sign-in gives the same neutral answer for known and unknown addresses",
    known.status === 202 &&
      unknown.status === 202 &&
      JSON.stringify(known.json) === JSON.stringify(unknown.json),
    `${known.status} and ${unknown.status}`,
  );

  // 2. Only the known address receives a link; follow it to get a session.
  const body = await latestMailTo(email);
  const link = body ? extractSignInLink(body) : null;
  record(
    "a sign-in link arrives in local mail capture",
    link !== null,
    link ? "found" : "none",
  );
  if (!link) return finish(results);

  let url: string | null = link;
  for (let hops = 0; url && hops < 8; hops++) {
    const res: Response = await fetch(url, {
      redirect: "manual",
      headers: { cookie: jar.header() },
    });
    jar.store(res.headers.getSetCookie());
    const next: string | null = res.headers.get("location");
    url = next ? new URL(next, url).toString() : null;
  }
  const first = await api("/api/guest/rsvp", "GET");
  record(
    "sign-in completes and the RSVP can be read",
    first.status === 200,
    String(first.status),
  );
  if (first.status !== 200 || !first.json) return finish(results);

  // 3. Submit answers for every invitation (attending), then read back.
  const guests: Json[] = first.json.guests ?? [];
  const payload = {
    guests: guests.map((g) => ({
      guest_id: g.id,
      responses: (g.invitations ?? [])
        .filter((i: Json) => !i.event.closed)
        .map((i: Json) => ({ event_id: i.event.id, status: "attending" })),
    })),
  };
  const saved = await api("/api/guest/rsvp", "PUT", payload);
  record("answers can be saved", saved.status === 200, String(saved.status));

  // 4. Name a plus-one if the household has an unfilled placeholder.
  const placeholder = guests.find((g) => g.is_placeholder);
  if (placeholder) {
    const named = await api("/api/guest/plus-one", "POST", {
      guest_id: placeholder.id,
      first_name: "Smoke",
      last_name: "Test",
    });
    record(
      "a plus-one can be named",
      named.status === 200,
      String(named.status),
    );
  } else {
    record("a plus-one can be named", true, "skipped: no placeholder");
  }

  // 5. Opt-out round trip.
  const off = await api("/api/guest/opt-out", "POST", { opt_out: true });
  const on = await api("/api/guest/opt-out", "POST", { opt_out: false });
  record(
    "reminders can be turned off and on",
    off.status === 200 && on.status === 200,
    `${off.status} and ${on.status}`,
  );

  // 6. Deadline error.
  if (closedEvent) {
    const owner = guests.find((g) =>
      (g.invitations ?? []).some((i: Json) => i.event.id === closedEvent),
    );
    const closed = await api("/api/guest/rsvp", "PUT", {
      guests: [
        {
          guest_id: owner?.id ?? "00000000-0000-4000-8000-000000000000",
          responses: [{ event_id: closedEvent, status: "attending" }],
        },
      ],
    });
    record(
      "answers after the deadline are refused",
      closed.status === 409 && closed.json?.error?.code === "rsvp_closed",
      String(closed.status),
    );
  } else {
    record(
      "answers after the deadline are refused",
      true,
      "skipped: no closed event configured",
    );
  }

  // 7. Sign out ends the session.
  const out = await api("/api/guest/sign-out", "POST");
  const after = await api("/api/guest/rsvp", "GET");
  record(
    "sign-out ends the session",
    out.status === 204 && after.status === 401,
    `${out.status} then ${after.status}`,
  );

  finish(results);
}

function finish(results: StepResult[]) {
  process.stdout.write(`${summarise(results)}\n`);
  if (results.some((r) => !r.pass)) process.exitCode = 1;
}

if (process.argv[1]?.endsWith("guest-api-smoke.ts")) {
  main().catch((e) => {
    process.stderr.write(`${(e as Error).message}\n`);
    process.exitCode = 1;
  });
}
