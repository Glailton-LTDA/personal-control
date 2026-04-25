import { test, expect } from '@playwright/test';

test.describe('Configurações - Automação de E-mail', () => {
  test.beforeEach(async ({ page }) => {
    // Mock Auth (Simplified)
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
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              user_id: 'user-123',
              recipient_email: 'test@example.com',
              bcc_email: 'bcc@example.com',
              skip_email_modal: false,
              auto_send_on_paid: false
            }),
          });
        } else {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
        }
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
      }
    });

    await page.goto('/');
    await page.waitForSelector('input[type="email"]', { timeout: 15000 });
    await page.locator('input[type="email"]').fill('test@example.com');
    await page.locator('input[type="password"]').fill('password123');
    await page.getByRole('button', { name: /entrar/i }).click();

    // Aguardar Dashboard via DOM
    await page.waitForFunction(() => !!document.querySelector('aside'), { timeout: 20000 });

    // Navegação para Configurações -> Geral
    await page.getByText(/configurações/i).click();
    await page.getByRole('button', { name: /geral/i }).click();
  });

  test('deve permitir configurar e-mail e opções de automação', async ({ page }) => {
    const recipientInput = page.locator('input[type="email"]').first();
    await recipientInput.fill('new@example.com');

    const skipModalCheckbox = page.locator('input[type="checkbox"]').first();
    await skipModalCheckbox.check();

    await page.getByRole('button', { name: /salvar configurações/i }).click();
    await expect(page.getByText('Configurações salvas com sucesso!')).toBeVisible();
  });

  test('deve respeitar a opção de pular modal no Financeiro', async ({ page }) => {
    // Forçar mock para skip_email_modal true
    await page.route('**/rest/v1/notification_settings*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            user_id: 'user-123',
            recipient_email: 'test@example.com',
            skip_email_modal: true
          }),
        });
      } else {
        await route.fulfill({ status: 200, body: JSON.stringify({ success: true }) });
      }
    });

    // Mock Finances
    await page.route('**/rest/v1/finances*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 1, description: 'Aluguel', amount: 1000, type: 'DESPESA', status: 'PENDENTE', payment_date: '2026-04-01' }]),
      });
    });

    // Ir para Financeiro
    await page.getByRole('button', { name: /transações/i }).click();

    // Mock Edge Function invoke
    await page.route('**/functions/v1/send-finance-email', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify({ status: 'sent' }) });
    });

    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    const sendButton = page.locator('.action-btn').filter({ has: page.locator('svg') }).first();
    await sendButton.click();

    // O modal NÃO deve aparecer
    await expect(page.getByText('Selecionar Destinatário')).not.toBeVisible();
  });
});
