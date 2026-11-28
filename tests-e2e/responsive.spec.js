import { test, expect } from '@playwright/test';
import {
  mockResponsiveApp,
  loginResponsive,
  assertResponsivePage,
} from './helpers/responsive';
const routes = [
  'launchpad',
  'myday',
  'settings/general',
  'settings/security',
  'minhasfinancas',
  'minhasfinancas/accounts',
  'minhasfinancas/accounts/account',
  'minhasfinancas/goals',
  'minhasfinancas/import',
  'health/today',
  'health/medications/medication',
  'health/appointments',
  'health/appointments/appointment',
  'health/exams/exam',
  'trips/list',
  'trips/itinerary/trip',
  'trips/settings',
  'cars/list',
  'cars/settings',
  'investments/dashboard',
  'investments/list',
  'investments/settings',
  'lists/manager',
  'lists/notes',
  'music/repertoire',
];
test.describe('PC-002 responsive layouts', { tag: '@responsive' }, () => {
  for (const width of [320, 768])
    for (const theme of ['light', 'dark'])
      test(`main flows fit ${width}px in ${theme}`, async ({ page }) => {
        test.setTimeout(240000);
        await page.setViewportSize({ width, height: 900 });
        await mockResponsiveApp(page, { theme });
        await loginResponsive(page);
        for (const route of routes) await assertResponsivePage(page, route);
      });
  for (const width of [1024, 1440])
    for (const theme of ['light', 'dark'])
      test(`wider layouts remain usable at ${width}px in ${theme}`, async ({
        page,
      }) => {
        test.setTimeout(90000);
        await page.setViewportSize({ width, height: 900 });
        await mockResponsiveApp(page, { theme });
        await loginResponsive(page);
        for (const route of [
          'trips/list',
          'trips/itinerary/trip',
          'trips/settings',
          'cars/list',
          'cars/settings',
          'investments/settings',
          'health/medications/medication',
        ])
          await assertResponsivePage(page, route);
      });
  for (const { width, height } of [
    { width: 320, height: 640 },
    { width: 768, height: 900 },
    { width: 390, height: 400 },
  ])
    for (const theme of ['light', 'dark'])
      test(`forms remain reachable at ${width}x${height} in ${theme}`, async ({
        page,
      }) => {
        test.setTimeout(90000);
        await page.setViewportSize({ width, height });
        await mockResponsiveApp(page, { theme });
        await loginResponsive(page);
        for (const kind of ['car', 'investment']) {
          await page.goto(kind === 'car' ? '/cars/list' : '/investments/list');
          await page.waitForLoadState('networkidle');
          if (kind === 'car')
            await page
              .getByRole('button', { name: 'Adicionar Carro', exact: true })
              .first()
              .click();
          else await page.getByTitle('Novo Registro', { exact: true }).click();
          const dialog = page.getByRole('dialog');
          await expect(dialog).toBeVisible();
          await expect(dialog).toHaveCSS('opacity', '1');
          const inputs = dialog.locator(
            'input:not([type=checkbox]):not([type=radio])'
          );
          for (const input of await inputs.all()) {
            const size = await input.boundingBox();
            expect(size.width).toBeGreaterThanOrEqual(width < 600 ? 180 : 160);
          }
          const field =
            kind === 'car'
              ? dialog.locator('input[type=text]').first()
              : dialog.locator('input[required]').first();
          await field.scrollIntoViewIfNeeded();
          await field.click();
          await expect(field).toBeFocused();
          const submit =
            kind === 'car'
              ? dialog.locator('button.btn-primary').last()
              : dialog.locator('button[type=submit]');
          await submit.scrollIntoViewIfNeeded();
          await expect(submit).toBeInViewport({ ratio: 1 });
          await submit.click({ trial: true });
          const close = dialog.getByRole('button', {
            name: 'Fechar',
            exact: true,
          });
          await expect(close).toBeInViewport({ ratio: 1 });
          await close.click();
          await expect(dialog).not.toBeVisible();
        }
      });
  test('trip form actions stay above mobile navigation and readable in light theme', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 640 });
    await mockResponsiveApp(page, { theme: 'light' });
    await loginResponsive(page);
    await assertResponsivePage(page, 'trips/settings');
    await page.getByTestId('edit-trip-btn').click();
    await expect(page.locator('.trip-form')).toHaveCSS('transform', 'none');
    const actions = page.locator('.trip-form-actions');
    await expect(actions).toBeVisible();
    const nav = await page.locator('.bottom-nav').boundingBox(),
      bar = await actions.boundingBox();
    expect(bar.y + bar.height).toBeLessThanOrEqual(nav.y);
    await actions
      .locator('button[type=submit]')
      .click({ trial: true });
    const title = page.locator('.trip-form input[required]').first();
    const color = await title.evaluate((el) => getComputedStyle(el).color);
    expect(color).not.toBe('rgb(255, 255, 255)');
    await page
      .locator('.trip-form')
      .screenshot({
        path: 'test-results/pc002-trip-form-mobile-light.png',
        animations: 'disabled',
      });
  });
});
