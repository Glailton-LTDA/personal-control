import { test, expect } from '@playwright/test';

test.describe('Viagens - Checklists (TODOs)', () => {
  test.beforeEach(async ({ page }) => {

    // Mock Auth (Simplified to match debug script)
    await page.route('**/auth/v1/token*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock-token',
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'mock-refresh',
          user: { id: 'user-123', email: 'test@example.com' },
        }),
      });
    });

    // Mock ALL REST requests to avoid 401s
    await page.route('**/rest/v1/*', async (route) => {
      const url = route.request().url();
      if (route.request().method() === 'GET') {
        if (url.includes('notification_settings')) {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ recipient_email: 'test@example.com' }) });
        } else if (url.includes('trip_checklists')) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
              { id: 'list-1', title: 'Mala de Mão', trip_id: 'trip-1' }
            ]),
          });
        } else if (url.includes('trip_checklist_items')) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
              { id: 'item-1', task: 'Passaporte', completed: false, checklist_id: 'list-1' }
            ]),
          });
        } else if (url.includes('trips')) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
              {
                id: 'trip-1',
                title: 'Viagem Teste',
                currencies: ['EUR'],
                user_id: 'user-123'
              }
            ]),
          });
        } else {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
        }
      } else {
        const method = route.request().method();
        if (method === 'POST') {
          if (url.includes('trip_checklists')) {
            await route.fulfill({
              status: 201,
              contentType: 'application/json',
              body: JSON.stringify({ id: 'new-list-123', title: 'Nova Lista E2E', trip_id: 'trip-1' }),
            });
          } else if (url.includes('trip_checklist_items')) {
            await route.fulfill({
              status: 201,
              contentType: 'application/json',
              body: JSON.stringify({ id: 'new-item-123', task: 'Item E2E', completed: false, checklist_id: 'list-1' }),
            });
          } else {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
          }
        } else {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
        }
      }
    });

    await page.goto('/');
    await page.waitForSelector('input[type="email"]', { timeout: 15000 });
    await page.locator('input[type="email"]').fill('test@example.com');
    await page.locator('input[type="password"]').fill('password123');
    await page.getByRole('button', { name: /entrar/i }).click();

    // Aguardar o Dashboard (Sidebar) carregar via DOM
    await page.waitForFunction(() => !!document.querySelector('aside'), { timeout: 20000 });

    // Navegação para Viagens
    await page.getByRole('button', { name: /minhas viagens/i }).click();
  });

  test('deve criar uma nova lista e adicionar itens', async ({ page }) => {
    const tripButton = page.locator('button.glass-card').first();
    await expect(tripButton).toBeVisible();
    await tripButton.click();

    await page.getByRole('button', { name: /checklists/i }).click();

    page.on('dialog', async dialog => {
      if (dialog.message().includes('Nome da nova lista')) {
        await dialog.accept('Nova Lista E2E');
      } else if (dialog.message().includes('Nova tarefa')) {
        await dialog.accept('Item E2E');
      }
    });

    await page.getByRole('button', { name: /nova lista/i }).click();
    await expect(page.getByText('Nova Lista E2E')).toBeVisible();

    await page.getByRole('button', { name: /adicionar item/i }).last().click();
    await expect(page.getByText('Item E2E')).toBeVisible();
  });

  test('deve abrir o modal de importação', async ({ page }) => {
    const tripButton = page.locator('button.glass-card').first();
    await tripButton.click();
    await page.getByRole('button', { name: /checklists/i }).click();

    await page.getByRole('button', { name: /importar/i }).click();
    await expect(page.getByText('Importar de outras viagens')).toBeVisible();
  });
});
