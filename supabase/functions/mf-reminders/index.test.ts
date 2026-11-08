import webpush from 'npm:web-push@3.6.7';
let handler: (request: Request) => Promise<Response>;
const serve = Deno.serve;
Deno.serve = ((callback: unknown) => {
  handler = callback as typeof handler;
  return {};
}) as typeof Deno.serve;
await import('./index.ts');
Deno.serve = serve;
const equal = (actual: unknown, expected: unknown) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(
      `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
};
Deno.test(
  'finance worker uses global enrollment and respects an opt-out during planning',
  async () => {
    Deno.env.set('CRON_SECRET', 'test-secret');
    Deno.env.set('SUPABASE_URL', 'https://push.test');
    Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-key');
    const keys = webpush.generateVAPIDKeys();
    Deno.env.set('VAPID_PUBLIC_KEY', keys.publicKey);
    Deno.env.set('VAPID_PRIVATE_KEY', keys.privateKey);
    Deno.env.set('MF_VAPID_MAILTO', 'mailto:test@example.com');
    const fetch = globalThis.fetch;
    const send = webpush.sendNotification;
    let sent = 0;
    const requests: URL[] = [];
    webpush.sendNotification = async () => {
      sent++;
      return {};
    };
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    globalThis.fetch = ((input) => {
      const url = new URL(String(input));
      requests.push(url);
      let payload: unknown = [];
      if (
        url.pathname.endsWith('/push_subscriptions') &&
        url.searchParams.get('select') !== 'id'
      )
        payload = [
          {
            id: 'device',
            user_id: 'owner',
            endpoint: 'https://fcm.googleapis.com/test',
            p256dh: 'key',
            auth: 'auth',
            language: 'en',
          },
        ];
      if (url.pathname.endsWith('/mf_accounts'))
        payload = [
          {
            id: 'account',
            name: 'Example',
            currency: 'BRL',
            account_type: 'CONTA',
          },
        ];
      if (url.pathname.endsWith('/mf_transactions'))
        payload = [
          {
            id: 'tx',
            account_id: 'account',
            type: 'DESPESA',
            description: 'Example',
            amount: 10,
            status: 'PENDENTE',
            payment_date: today,
            due_date: today,
          },
        ];
      return Promise.resolve(Response.json(payload));
    }) as typeof globalThis.fetch;
    try {
      const response = await handler(
        new Request('https://worker.test', {
          method: 'POST',
          headers: { Authorization: 'Bearer test-secret' },
        }),
      );
      equal(response.status, 200);
      equal(await response.json(), { success: true, sent: 0 });
      equal(sent, 0);
      equal(
        requests.filter((url) => url.pathname.endsWith('/push_subscriptions'))
          .length,
        2,
      );
      for (const url of requests) {
        if (url.searchParams.get('select')?.includes('*'))
          throw new Error('wildcard projection');
        if (
          url.pathname.endsWith('/mf_accounts') ||
          url.pathname.endsWith('/mf_transactions')
        )
          equal(url.searchParams.get('user_id'), 'eq.owner');
      }
    } finally {
      globalThis.fetch = fetch;
      webpush.sendNotification = send;
    }
  },
);
