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
              auto_send_on_paid: false,
              skip_confirmations: false
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
    await page.getByTestId('login-btn').click();

    // Aguardar Dashboard via DOM (espera pelo header do novo layout)
    await page.waitForSelector('header', { timeout: 20000 });
    await expect(page.getByTestId('welcome-message')).toBeVisible({ timeout: 15000 });

    // Navegação para Configurações via Launchpad
    await page.getByTestId('launchpad-item-settings').click();
    await page.waitForLoadState('networkidle');
    
    // Agora verifica se a aba geral está ativa (sub-item)
    await expect(page.getByTestId('sidebar-sub-item-settings-general')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('sidebar-sub-item-settings-general').click();
  });

  test('deve permitir configurar e-mail e opções de automação', async ({ page }) => {
    const recipientInput = page.getByTestId('recipient-email-input');
    await recipientInput.fill('new@example.com');

    const skipModalCheckbox = page.getByTestId('skip-email-modal-check');
    await skipModalCheckbox.check();

    await page.getByTestId('save-settings-button').click();
    await expect(page.getByText(/Configurações salvas com sucesso!|Settings saved successfully!/)).toBeVisible();
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
            skip_email_modal: true,
            skip_confirmations: false
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

    // Volta para o Launchpad via Logo/Orbit e depois vai para Financeiro
    await page.getByTestId('sidebar-group-launchpad').click();
    await page.getByTestId('launchpad-item-finances').click();
    await page.waitForLoadState('networkidle');
    
    // Força o clique no item "Transações" via evaluate para evitar problemas de visibilidade no glassmorphism
    await page.evaluate(() => {
      const btn = document.querySelector('[data-testid="sidebar-sub-item-finances-transactions"]');
      if (btn) btn.click();
      else {
        // Fallback por texto
        const elements = Array.from(document.querySelectorAll('a, button'));
        const target = elements.find(el => el.textContent.includes('Transações'));
        if (target) target.click();
      }
    });

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
