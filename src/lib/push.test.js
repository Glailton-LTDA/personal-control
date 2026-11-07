import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock('./supabase', async () => {
  const { createClient } = await import('@supabase/supabase-js');
  return {
    supabase: createClient('https://push.test', 'test-key', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: fetchMock },
    }),
  };
});
vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'AQID');
const {
  readGlobalPush,
  enableGlobalPush,
  disableGlobalPush,
  reconcilePushAccount,
  unsubscribeDevicePush,
} = await import('./push');
const OWNER = '11111111-1111-4111-8111-111111111111';
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
let registration, sub;
function subscription(endpoint) {
  return {
    endpoint,
    unsubscribe: vi.fn().mockResolvedValue(true),
    toJSON: () => ({ endpoint, keys: { p256dh: 'key', auth: 'auth' } }),
  };
}
beforeEach(() => {
  fetchMock.mockReset();
  sub = subscription('https://fcm.googleapis.com/current');
  registration = {
    pushManager: {
      getSubscription: vi.fn(async () => sub),
      subscribe: vi.fn(async () =>
        subscription('https://fcm.googleapis.com/fresh'),
      ),
    },
  };
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('PushManager', class {});
  vi.stubGlobal('Notification', {
    permission: 'granted',
    requestPermission: vi.fn().mockResolvedValue('granted'),
  });
  vi.stubGlobal('navigator', {
    serviceWorker: {
      getRegistration: vi.fn(async () => registration),
      register: vi.fn(async () => registration),
      ready: Promise.resolve(registration),
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('global push consent', () => {
  it('reads only the authenticated owner and does not prompt automatically', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ id: 'device', enabled: true, language: 'pt' }),
    );
    expect(await readGlobalPush(OWNER)).toEqual({ state: 'on', enabled: true });
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe('/rest/v1/push_subscriptions');
    expect(url.searchParams.get('user_id')).toBe(`eq.${OWNER}`);
    expect(url.searchParams.get('select')).not.toContain('*');
    expect(Notification.requestPermission).not.toHaveBeenCalled();
  });
  it('enables one global subscription and stores the chosen language', async () => {
    sub = null;
    fetchMock.mockResolvedValueOnce(json({ id: 'device' }));
    const operation = enableGlobalPush(OWNER, 'es-MX');
    expect(Notification.requestPermission).toHaveBeenCalledTimes(1);
    expect(await operation).toEqual({ state: 'on', enabled: true });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      user_id: OWNER,
      language: 'es',
      enabled: true,
    });
    expect(
      new URL(fetchMock.mock.calls[0][0]).searchParams.get('on_conflict'),
    ).toBe('endpoint');
  });
  it('persists the global opt-out before cancelling the browser subscription', async () => {
    fetchMock
      .mockResolvedValueOnce(
        json({ id: 'device', enabled: true, language: 'pt' }),
      )
      .mockImplementationOnce(async () => {
        expect(sub.unsubscribe).not.toHaveBeenCalled();
        return json({ id: 'device' });
      });
    expect(await disableGlobalPush(OWNER)).toEqual({
      state: 'off',
      enabled: false,
    });
    expect(sub.unsubscribe).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      enabled: false,
    });
  });
  it('does not unsubscribe or claim success when the database opt-out fails', async () => {
    fetchMock
      .mockResolvedValueOnce(
        json({ id: 'device', enabled: true, language: 'pt' }),
      )
      .mockResolvedValueOnce(json({ message: 'Forbidden' }, 403));
    await expect(disableGlobalPush(OWNER)).rejects.toBeTruthy();
    expect(sub.unsubscribe).not.toHaveBeenCalled();
  });
  it('rotates an endpoint that is not owned by the logged-in account', async () => {
    const old = sub;
    fetchMock
      .mockResolvedValueOnce(json(null))
      .mockResolvedValueOnce(json({ id: 'new-device' }));
    await enableGlobalPush(OWNER, 'en');
    expect(old.unsubscribe).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).endpoint).toBe(
      'https://fcm.googleapis.com/fresh',
    );
  });
  it('removes a newly created browser subscription if enrollment fails', async () => {
    sub = null;
    const fresh = subscription('https://fcm.googleapis.com/fresh');
    registration.pushManager.subscribe.mockResolvedValueOnce(fresh);
    fetchMock.mockResolvedValueOnce(json({ message: 'Write failed' }, 500));
    await expect(enableGlobalPush(OWNER, 'pt')).rejects.toBeTruthy();
    expect(fresh.unsubscribe).toHaveBeenCalledTimes(1);
  });
  it('detaches a different account on login without asking permission', async () => {
    fetchMock.mockResolvedValueOnce(json(null));
    await reconcilePushAccount(OWNER, 'pt');
    expect(sub.unsubscribe).toHaveBeenCalledTimes(1);
    expect(Notification.requestPermission).not.toHaveBeenCalled();
  });
  it('updates language for an existing owner without enabling a disabled subscription', async () => {
    fetchMock
      .mockResolvedValueOnce(
        json({ id: 'device', enabled: true, language: 'pt' }),
      )
      .mockResolvedValueOnce(json({ id: 'device' }));
    await reconcilePushAccount(OWNER, 'en-US');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      language: 'en',
    });
    expect(sub.unsubscribe).not.toHaveBeenCalled();
  });
  it('detaches the device on logout without reading private database rows', async () => {
    await unsubscribeDevicePush();
    expect(sub.unsubscribe).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('does not write a subscription if browser permission is denied', async () => {
    Notification.requestPermission.mockResolvedValueOnce('denied');
    await expect(enableGlobalPush(OWNER, 'pt')).rejects.toThrow('blocked');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
