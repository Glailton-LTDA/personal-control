import { test, expect } from '@playwright/test';
const OWNER = '11111111-1111-4111-8111-111111111111';
async function mock(page, { theme = 'dark', fail = false } = {}) {
  await page.clock.setSystemTime(new Date('2026-11-27T12:00:00Z'));
  await page.addInitScript((theme) => {
    localStorage.setItem('personal-control-theme', theme);
    localStorage.setItem('i18nextLng', 'pt');
  }, theme);
  const user = {
    id: OWNER,
    email: 'synthetic@example.test',
    user_metadata: { name: 'Synthetic' },
  };
  const calls = [];
  let taken = false,
    version = 0;
  await page.route('**/auth/v1/**', (route) =>
    route.fulfill({
      json: route.request().url().includes('/token')
        ? {
            access_token: 'synthetic-token',
            token_type: 'bearer',
            expires_in: 3600,
            refresh_token: 'synthetic-refresh',
            user,
          }
        : user,
    })
  );
  await page.route('**/rest/v1/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1);
    if (name === 'my_day_summary') {
      calls.push({
        name,
        body: route.request().postDataJSON(),
        authorization: route.request().headers().authorization,
      });
      if (fail)
        return route.fulfill({
          status: 500,
          json: { message: 'synthetic failure' },
        });
      return route.fulfill({
        json: {
          day: '2026-11-27',
          generated_at: '2026-11-27T12:00:00Z',
          sections: {
            doses: {
              rows: [
                {
                  id: 'dose',
                  medication_id: 'med',
                  title: 'Amoxicilina',
                  dose: '1 cápsula',
                  scheduled_at: '2026-11-27T06:00:00Z',
                  status: taken ? 'taken' : 'missed',
                  record_version: version,
                },
              ],
            },
            appointments: {
              rows: [
                {
                  id: 'appointment',
                  title: 'Cardiologista',
                  scheduled_at: '2026-11-27T16:00:00Z',
                  professional: 'Dra. Ana',
                  address: 'Rua de Teste, 123',
                },
              ],
            },
            payments: {
              rows: [
                {
                  id: 'payment',
                  title: 'Internet residencial',
                  day: '2026-11-27',
                  amount: 129.9,
                  currency: 'BRL',
                  account_id: 'account',
                },
              ],
            },
            invoices: {
              rows: [
                {
                  id: 'invoice',
                  title: 'Cartão sintético',
                  day: '2026-11-26',
                  amount: 480,
                  currency: 'BRL',
                  account_id: 'card',
                },
              ],
            },
            exams: {
              rows: [
                {
                  id: 'exam',
                  title: 'Exame de sangue',
                  scheduled_at: '2026-11-28T10:00:00Z',
                },
              ],
            },
            itinerary: {
              rows: [
                {
                  id: 'itinerary',
                  title: 'Check-in no hotel',
                  day: '2026-11-27',
                  time: '19:00',
                  trip_id: 'trip',
                  trip_title: 'Recife',
                },
              ],
            },
            trips: {
              rows: [
                { id: 'trip', title: 'Viagem a Recife', day: '2026-11-30' },
              ],
            },
          },
        },
      });
    }
    if (['health_dose_record', 'health_dose_undo'].includes(name)) {
      calls.push({ name, body: route.request().postDataJSON() });
      taken = name === 'health_dose_record';
      version++;
      return route.fulfill({
        json: { status: taken ? 'taken' : 'scheduled', row_version: version },
      });
    }
    if (name === 'notification_settings')
      return route.fulfill({
        json: {
          menu_order: [
            'launchpad',
            'myday',
            'minhasfinancas',
            'health',
            'trips',
            'settings',
          ],
          visible_modules: [
            'launchpad',
            'myday',
            'minhasfinancas',
            'health',
            'trips',
            'settings',
          ],
        },
      });
    if (name === 'health_refresh_reminders') return route.fulfill({ json: {} });
    return route.fulfill({ json: [] });
  });
  return calls;
}
async function login(page) {
  await page.goto('/');
  await page.locator('input[type=email]').fill('synthetic@example.test');
  await page.locator('input[type=password]').fill('synthetic-password');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByTestId('launchpad-item-myday')).toBeVisible();
}
for (const width of [320, 768, 1440])
  for (const theme of ['light', 'dark'])
    test(`my day works at ${width}px in ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      const calls = await mock(page, { theme });
      await login(page);
      expect(calls.filter((c) => c.name === 'my_day_summary')).toHaveLength(0);
      await page.getByTestId('launchpad-item-myday').click();
      await expect(page.getByTestId('my-day')).toBeVisible();
      await expect(
        page.getByText('Amoxicilina', { exact: true })
      ).toBeVisible();
      await expect(
        page.getByText('Cardiologista', { exact: true })
      ).toBeVisible();
      await expect(
        page.getByText('Exame de sangue', { exact: true })
      ).toBeVisible();
      expect(calls.filter((c) => c.name === 'my_day_summary')).toHaveLength(1);
      expect(calls.find((c) => c.name === 'my_day_summary').authorization).toBe(
        'Bearer synthetic-token'
      );
      await page.locator('.main-header > a[href="/launchpad"]').click();
      await page.getByTestId('launchpad-item-myday').click();
      await expect(page.getByText('Amoxicilina', {exact:true})).toBeVisible();
      expect(calls.filter(c=>c.name==='my_day_summary')).toHaveLength(1);
      await page
        .getByRole('button', { name: 'Marcar dose de Amoxicilina como tomada' })
        .click();
      await expect(
        page.getByRole('button', { name: 'Desfazer dose de Amoxicilina' })
      ).toBeVisible();
      expect(calls.filter((c) => c.name === 'health_dose_record')).toHaveLength(
        1
      );
      expect(calls.filter((c) => c.name === 'my_day_summary')).toHaveLength(2);
      await page
        .getByRole('button', { name: 'Desfazer dose de Amoxicilina' })
        .click();
      await expect(
        page.getByRole('button', {
          name: 'Marcar dose de Amoxicilina como tomada',
        })
      ).toBeVisible();
      expect(calls.filter((c) => c.name === 'health_dose_undo')).toHaveLength(
        1
      );
      expect(calls.filter((c) => c.name === 'my_day_summary')).toHaveLength(3);
      await page.locator('.main-header > a[href="/launchpad"]').click();
      await page.getByTestId('launchpad-item-myday').click();
      await expect(page.getByText('Amoxicilina',{exact:true})).toBeVisible();
      expect(calls.filter(c=>c.name==='my_day_summary')).toHaveLength(3);
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth
          )
        )
        .toBe(true);
      await page
        .getByTestId('my-day')
        .screenshot({
          path: `test-results/my-day-${width}-${theme}.png`,
          animations: 'disabled',
        });
    });
test('my day does not request data before login and has a recoverable failure state', async ({
  page,
}) => {
  const calls = await mock(page, { fail: true });
  await page.goto('/myday');
  await expect(page.locator('input[type=email]')).toBeVisible();
  expect(calls).toHaveLength(0);
  await login(page);
  await page.getByTestId('launchpad-item-myday').click();
  await expect(page.getByRole('alert')).toContainText(
    'Não foi possível carregar seu dia'
  );
  expect(calls.filter((c) => c.name === 'my_day_summary')).toHaveLength(1);
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect
    .poll(() => calls.filter((c) => c.name === 'my_day_summary').length)
    .toBe(2);
});
