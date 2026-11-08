import webpush from 'npm:web-push@3.6.7';

// Capture the real handler without starting a listener or contacting production.
let handler: (request: Request) => Promise<Response>;
const serve = Deno.serve;
Deno.serve = ((callback: unknown) => {
  handler = callback as typeof handler;
  return {};
}) as typeof Deno.serve;
await import('./index.ts');
Deno.serve = serve;

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

Deno.test(
  'cron authorization fails closed; authorized worker only accesses queue RPCs',
  async () => {
    Deno.env.set('CRON_SECRET', 'ephemeral-test-secret');
    Deno.env.set('SUPABASE_URL', 'https://health.test');
    Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'ephemeral-test-key');
    const keys = webpush.generateVAPIDKeys();
    Deno.env.set('VAPID_PUBLIC_KEY', keys.publicKey);
    Deno.env.set('VAPID_PRIVATE_KEY', keys.privateKey);
    Deno.env.set('MF_VAPID_MAILTO', 'mailto:test@example.com');
    const requests: string[] = [];
    const fetch = globalThis.fetch;
    globalThis.fetch = ((input: string | URL | Request) => {
      const url = String(input);
      requests.push(url);
      const payload = url.endsWith('health_claim_reminders') ? [] : null;
      return Promise.resolve(Response.json(payload));
    }) as typeof globalThis.fetch;
    try {
      equal(
        (await handler(new Request('https://worker.test', { method: 'POST' })))
          .status,
        401,
      );
      equal(
        (
          await handler(
            new Request('https://worker.test', {
              method: 'POST',
              headers: { Authorization: 'Bearer wrong-secret' },
            }),
          )
        ).status,
        401,
      );
      equal(requests, []);
      const authorized = { Authorization: 'Bearer ephemeral-test-secret' };
      equal(
        (
          await handler(
            new Request('https://worker.test', { headers: authorized }),
          )
        ).status,
        405,
      );
      equal(requests, []);
      const response = await handler(
        new Request('https://worker.test', {
          method: 'POST',
          headers: authorized,
        }),
      );
      equal(response.status, 200);
      equal(await response.json(), { sent: 0 });
      equal(
        requests.map((url) => new URL(url).pathname),
        [
          '/rest/v1/rpc/health_prepare_reminders',
          '/rest/v1/rpc/health_claim_reminders',
        ],
      );
    } finally {
      globalThis.fetch = fetch;
    }
  },
);
