import webpush from "npm:web-push@3.6.7";

// Capture the real handler without starting a listener or contacting production.
let handler: (request: Request) => Promise<Response>;
const serve = Deno.serve;
Deno.serve = ((callback: unknown) => {
  handler = callback as typeof handler;
  return {};
}) as typeof Deno.serve;
await import("./index.ts");
Deno.serve = serve;

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

Deno.test(
  "cron authorization fails closed; authorized worker only accesses queue RPCs",
  async () => {
    Deno.env.set("CRON_SECRET", "ephemeral-test-secret");
    Deno.env.set("SUPABASE_URL", "https://health.test");
    Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "ephemeral-test-key");
    const keys = webpush.generateVAPIDKeys();
    Deno.env.set("VAPID_PUBLIC_KEY", keys.publicKey);
    Deno.env.set("VAPID_PRIVATE_KEY", keys.privateKey);
    Deno.env.set("MF_VAPID_MAILTO", "mailto:test@example.com");
    const requests: string[] = [];
    const fetch = globalThis.fetch;
    globalThis.fetch = ((input: string | URL | Request) => {
      const url = String(input);
      requests.push(url);
      const payload = url.endsWith("health_claim_reminders") ? [] : null;
      return Promise.resolve(Response.json(payload));
    }) as typeof globalThis.fetch;
    try {
      equal(
        (await handler(new Request("https://worker.test", { method: "POST" })))
          .status,
        401,
      );
      equal(
        (
          await handler(
            new Request("https://worker.test", {
              method: "POST",
              headers: { Authorization: "Bearer wrong-secret" },
            }),
          )
        ).status,
        401,
      );
      equal(requests, []);
      const authorized = { Authorization: "Bearer ephemeral-test-secret" };
      equal(
        (
          await handler(
            new Request("https://worker.test", { headers: authorized }),
          )
        ).status,
        405,
      );
      equal(requests, []);
      const response = await handler(
        new Request("https://worker.test", {
          method: "POST",
          headers: authorized,
        }),
      );
      equal(response.status, 200);
      equal(await response.json(), { sent: 0 });
      equal(
        requests.map((url) => new URL(url).pathname),
        [
          "/rest/v1/rpc/health_prepare_reminders",
          "/rest/v1/rpc/health_claim_reminders",
        ],
      );
    } finally {
      globalThis.fetch = fetch;
    }
  },
);

for (const mode of [
  "missing",
  "off",
  "error",
  "on",
  "foreign",
  "appointment",
  "revoked",
]) {
  Deno.test(
    `medication privacy is owner-scoped and fails closed: ${mode}`,
    async () => {
      Deno.env.set("CRON_SECRET", "ephemeral-test-secret");
      Deno.env.set("SUPABASE_URL", "https://health.test");
      Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "ephemeral-test-key");
      const keys = webpush.generateVAPIDKeys();
      Deno.env.set("VAPID_PUBLIC_KEY", keys.publicKey);
      Deno.env.set("VAPID_PRIVATE_KEY", keys.privateKey);
      Deno.env.set("MF_VAPID_MAILTO", "mailto:test@example.com");
      const originalFetch = globalThis.fetch,
        originalSend = webpush.sendNotification;
      const payloads: Record<string, unknown>[] = [];
      let medicationReads = 0;
      let preferenceReads = 0;
      webpush.sendNotification = async (_sub: unknown, body: unknown) => {
        payloads.push(JSON.parse(String(body)));
        return {};
      };
      globalThis.fetch = ((
        input: string | URL | Request,
        init?: RequestInit,
      ) => {
        const url = new URL(String(input));
        const table = url.pathname.split("/").at(-1);
        if (table === "health_prepare_reminders")
          return Promise.resolve(Response.json(null));
        if (table === "health_claim_reminders")
          return Promise.resolve(
            Response.json([{ id: "r1", user_id: "owner" }]),
          );
        equal(url.searchParams.get("user_id"), "eq.owner");
        if (table === "health_reminders") {
          if (init?.method === "PATCH")
            return Promise.resolve(Response.json(null));
          equal(
            url.searchParams.get("select"),
            "id,medication_id,scheduled_at",
          );
          return Promise.resolve(
            Response.json({
              id: "r1",
              medication_id: mode === "appointment" ? null : "m1",
              scheduled_at: "2026-11-23T18:00:00Z",
            }),
          );
        }
        if (table === "notification_settings") {
          preferenceReads++;
          equal(url.searchParams.get("select"), "show_medication_details");
          if (mode === "error")
            return Promise.resolve(
              Response.json({ message: "schema missing" }, { status: 400 }),
            );
          return Promise.resolve(
            Response.json(
              mode === "missing"
                ? null
                : {
                    show_medication_details:
                      ["on", "foreign", "revoked"].includes(mode) &&
                      (mode !== "revoked" || preferenceReads === 1),
                  },
            ),
          );
        }
        if (table === "health_medications") {
          medicationReads++;
          equal(url.searchParams.get("id"), "eq.m1");
          equal(url.searchParams.get("select"), "name,dose,timezone");
          return Promise.resolve(
            Response.json(
              mode === "foreign"
                ? null
                : {
                    name: "Synthetic medication",
                    dose: "1 tablet",
                    timezone: "UTC",
                  },
            ),
          );
        }
        if (table === "push_subscriptions") {
          return Promise.resolve(
            Response.json(
              url.searchParams.get("id")
                ? { id: "device" }
                : [
                    {
                      id: "device",
                      user_id: "owner",
                      language: "pt",
                      endpoint: "https://fcm.googleapis.com/device",
                      p256dh: "key",
                      auth: "auth",
                    },
                  ],
            ),
          );
        }
        throw new Error(`Unexpected table ${table}`);
      }) as typeof globalThis.fetch;
      try {
        const response = await handler(
          new Request("https://worker.test", {
            method: "POST",
            headers: { Authorization: "Bearer ephemeral-test-secret" },
          }),
        );
        equal(response.status, 200);
        equal(payloads.length, 1);
        equal(
          medicationReads,
          ["on", "foreign", "revoked"].includes(mode) ? 1 : 0,
        );
        if (mode === "on") {
          equal(payloads[0].title, "Hora de tomar Synthetic medication");
          equal(
            payloads[0].body,
            "18:00 · 1 tablet. Abra para registrar a dose.",
          );
          equal(payloads[0].url, "/health/medications/m1");
        } else {
          equal(payloads[0].title, "Guia médico");
          equal(payloads[0].url, "/health/today");
          equal(
            JSON.stringify(payloads[0]).includes("Synthetic medication"),
            false,
          );
        }
      } finally {
        globalThis.fetch = originalFetch;
        webpush.sendNotification = originalSend;
      }
    },
  );
}
