import { test, expect } from '@playwright/test';
const OWNER = '11111111-1111-4111-8111-111111111111';
async function openSettings(
  page,
  {
    language = 'pt',
    enabled = false,
    blocked = false,
    failDisable = false,
  } = {},
) {
  const user = {
    id: OWNER,
    email: 'push-test@example.com',
    user_metadata: { name: 'Test' },
  };
  let row = enabled
    ? {
        id: 'device',
        user_id: OWNER,
        endpoint: 'https://fcm.googleapis.com/device',
        p256dh: 'key',
        auth: 'auth',
        enabled: true,
        language,
      }
    : null;
  const requests = [];
  await page.addInitScript(
    ({ language, enabled, blocked }) => {
      localStorage.setItem('i18nextLng', language);
      localStorage.setItem('personal-control-theme', 'light');
      window.__pushCalls = { permission: 0, subscribe: 0, unsubscribe: 0 };
      let current;
      const create = () => ({
        endpoint: 'https://fcm.googleapis.com/device',
        toJSON: () => ({
          endpoint: 'https://fcm.googleapis.com/device',
          keys: { p256dh: 'key', auth: 'auth' },
        }),
        unsubscribe: async () => {
          window.__pushCalls.unsubscribe++;
          current = null;
          return true;
        },
      });
      current = enabled ? create() : null;
      const registration = {
        pushManager: {
          getSubscription: async () => current,
          subscribe: async () => {
            window.__pushCalls.subscribe++;
            current = create();
            return current;
          },
        },
      };
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: {
          getRegistration: async () => registration,
          register: async () => registration,
          ready: Promise.resolve(registration),
        },
      });
      Object.defineProperty(Notification, 'permission', {
        configurable: true,
        get: () => (blocked ? 'denied' : 'granted'),
      });
      Notification.requestPermission = async () => {
        window.__pushCalls.permission++;
        return blocked ? 'denied' : 'granted';
      };
    },
    { language, enabled, blocked },
  );
  await page.route('**/auth/v1/**', (route) =>
    route.fulfill({
      json: route.request().url().includes('/token')
        ? {
            access_token: 'fake-token',
            token_type: 'bearer',
            expires_in: 3600,
            refresh_token: 'fake-refresh',
            user,
          }
        : user,
    }),
  );
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const table = url.pathname.split('/').at(-1);
    if (table === 'push_subscriptions') {
      requests.push({
        url,
        method: request.method(),
        body: request.postDataJSON(),
      });
      if (request.method() === 'POST') {
        row = { ...request.postDataJSON(), id: 'device' };
        return route.fulfill({ json: { id: 'device' } });
      }
      if (request.method() === 'PATCH') {
        if (failDisable && request.postDataJSON().enabled === false)
          return route.fulfill({
            status: 500,
            json: { message: 'test failure' },
          });
        row = { ...row, ...request.postDataJSON() };
        return route.fulfill({ json: { id: 'device' } });
      }
      return route.fulfill({ json: row });
    }
    if (table === 'notification_settings')
      return route.fulfill({
        json: {
          menu_order: ['launchpad', 'health', 'minhasfinancas', 'settings'],
          visible_modules: [
            'launchpad',
            'health',
            'minhasfinancas',
            'settings',
          ],
        },
      });
    return route.fulfill({ json: [] });
  });
  await page.goto('/settings/general');
  await page.locator('input[type=email]').fill(user.email);
  await page.locator('input[type=password]').fill('test-password');
  await page.getByTestId('login-btn').click();
  await expect(page.getByTestId('global-push-settings')).toBeVisible();
  return { requests, getRow: () => row };
}
const routeTo = (page, tab) =>
  page.evaluate(
    (tab) =>
      window.dispatchEvent(
        new CustomEvent('set-active-tab', { detail: { tab } }),
      ),
    tab,
  );

for (const width of [320, 768, 1440]) {
  test(`one global toggle in app settings fits ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const { requests, getRow } = await openSettings(page);
    const toggle = page.getByTestId('global-push-toggle');
    await expect(toggle).toBeEnabled();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(getRow().enabled).toBe(true);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(getRow().enabled).toBe(false);
    const bad = await page.getByTestId('app-settings').evaluate((root) =>
      [root, ...root.querySelectorAll('*')]
        .filter(
          (el) =>
            el.getClientRects().length &&
            !['INPUT', 'SELECT', 'TEXTAREA', 'svg', 'path'].includes(
              el.tagName,
            ) &&
            // Decorative flag shapes are clipped; their ancestors are checked.
            !['hidden', 'clip'].includes(getComputedStyle(el).overflowX) &&
            getComputedStyle(el).display !== 'inline' &&
            el.scrollWidth > el.clientWidth + 2,
        )
        .map((el) => ({
          tag: el.tagName,
          text: el.textContent.slice(0, 100),
          class: el.className,
          width: el.clientWidth,
          scroll: el.scrollWidth,
          style: el.getAttribute('style'),
        })),
    );
    expect(bad).toEqual([]);
    await routeTo(page, 'health/today');
    await expect(page.getByTestId('health-guide')).toBeVisible();
    await expect(page.getByTestId('global-push-toggle')).toHaveCount(0);
    await page
      .getByRole('button', { name: 'Ajustar notificações', exact: true })
      .click();
    await expect(page.getByTestId('global-push-toggle')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(await page.evaluate(() => window.__pushCalls)).toEqual({
      permission: 1,
      subscribe: 1,
      unsubscribe: 1,
    });
    for (const request of requests) {
      expect(request.url.searchParams.get('select')).not.toContain('*');
      if (request.method === 'GET' || request.method === 'PATCH')
        expect(request.url.searchParams.get('user_id')).toBe(`eq.${OWNER}`);
    }
    if (width === 320)
      await page
        .getByTestId('global-push-settings')
        .screenshot({ path: '/tmp/global-push-settings-mobile.png' });
  });
}
test('a failed global opt-out does not cancel the browser or pretend to be off', async ({
  page,
}) => {
  await openSettings(page, { enabled: true, failDisable: true });
  const toggle = page.getByTestId('global-push-toggle');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.click();
  await expect(
    page.getByText('Não foi possível salvar a preferência. Tente novamente.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  expect((await page.evaluate(() => window.__pushCalls)).unsubscribe).toBe(0);
});
test('blocked permissions do not prompt or create a subscription', async ({
  page,
}) => {
  const { requests } = await openSettings(page, { blocked: true });
  await expect(page.getByTestId('global-push-toggle')).toBeDisabled();
  expect(await page.evaluate(() => window.__pushCalls.permission)).toBe(0);
  expect(requests.filter((row) => row.method === 'POST')).toHaveLength(0);
});
for (const [language, title, enable] of [
  ['en', 'App notifications', 'Enable on this device'],
  ['es', 'Notificaciones de la aplicación', 'Activar en este dispositivo'],
]) {
  test(`global settings translated to ${language}`, async ({ page }) => {
    await openSettings(page, { language });
    await expect(
      page.getByRole('heading', { name: title, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: enable, exact: true }),
    ).toBeEnabled();
  });
}
