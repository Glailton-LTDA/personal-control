import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import webpush from 'npm:web-push@3.6.7';
import {
  globalPushPages,
  sendGlobalPush,
  trustedPushEndpoint,
} from './push.ts';
import {
  financeTransactionCopy,
  financeInvoiceCopy,
} from './finance-push-copy.ts';

const sub = {
  id: 'device',
  user_id: 'owner',
  endpoint: 'https://fcm.googleapis.com/test',
  p256dh: 'key',
  auth: 'auth',
  language: 'pt',
};
function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(
      `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
}
const client = (fetch: typeof globalThis.fetch) =>
  createClient('https://push.test', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch },
  });
Deno.test(
  'global opt-out is rechecked before sending and suppresses delivery',
  async () => {
    let delivered = 0;
    const send = webpush.sendNotification;
    webpush.sendNotification = async () => {
      delivered++;
      return {};
    };
    const db = client((input) => {
      const url = new URL(String(input));
      equal(url.pathname, '/rest/v1/push_subscriptions');
      equal(url.searchParams.get('enabled'), 'eq.true');
      equal(url.searchParams.get('user_id'), 'eq.owner');
      return Promise.resolve(Response.json(null));
    });
    try {
      equal(await sendGlobalPush(db, sub, { type: 'health-reminder' }), false);
      equal(delivered, 0);
    } finally {
      webpush.sendNotification = send;
    }
  },
);
Deno.test(
  'expired subscriptions are removed globally and scoped to their owner',
  async () => {
    const send = webpush.sendNotification;
    webpush.sendNotification = async () => {
      throw { statusCode: 410 };
    };
    const calls: { url: URL; method: string }[] = [];
    const db = client((input, init) => {
      calls.push({
        url: new URL(String(input)),
        method: init?.method || 'GET',
      });
      return Promise.resolve(
        Response.json(init?.method === 'DELETE' ? null : { id: 'device' }),
      );
    });
    try {
      equal(await sendGlobalPush(db, sub, { type: 'mf-reminder' }), false);
      equal(calls[1].method, 'DELETE');
      equal(calls[1].url.pathname, '/rest/v1/push_subscriptions');
      equal(calls[1].url.searchParams.get('user_id'), 'eq.owner');
    } finally {
      webpush.sendNotification = send;
    }
  },
);
Deno.test(
  'subscription pages continue beyond the API row limit without a wildcard',
  async () => {
    let count = 0;
    const db = client((input) => {
      const url = new URL(String(input));
      equal(url.searchParams.get('limit'), '200');
      if (url.searchParams.get('select')?.includes('*'))
        throw new Error('wildcard');
      count++;
      return Promise.resolve(
        Response.json(
          count === 1
            ? Array.from({ length: 200 }, (_, i) => ({ ...sub, id: String(i) }))
            : [{ ...sub, id: 'last' }],
        ),
      );
    });
    const rows = [];
    for await (const page of globalPushPages(db)) rows.push(...page);
    equal(rows.length, 201);
    equal(count, 2);
  },
);
Deno.test('push endpoints cannot target arbitrary servers', () => {
  for (const endpoint of [
    'http://fcm.googleapis.com/test',
    'https://localhost/test',
    'https://updates.push.services.mozilla.com.evil.test/test',
    'https://user:pass@fcm.googleapis.com/test',
  ])
    equal(trustedPushEndpoint(endpoint), false);
  equal(trustedPushEndpoint('https://fcm.googleapis.com/test'), true);
});
Deno.test('financial notifications use the enrolled device language', () => {
  const row = {
    description: 'Example',
    suffix: '',
    kind: 'today',
    amount: 10,
    currency: 'BRL',
    accountName: '',
    extra: 0,
  };
  equal(financeTransactionCopy(row, 'en').title, 'Example is due today');
  equal(financeTransactionCopy(row, 'es').title, 'Example vence hoy');
  equal(financeTransactionCopy(row, 'pt').title, 'Example vence hoje');
  const invoice = {
    cardName: 'Example',
    total: 10,
    currency: 'BRL',
    open: 0,
    pending: 0,
    dueISO: '2026-11-10',
  };
  if (!financeInvoiceCopy(invoice, 'en').body.includes('statement paid'))
    throw new Error('untranslated status');
});
