import { test, expect } from '@playwright/test';

test.describe('Investments Module', () => {
  /** Desbloqueia o app se o modal de segurança aparecer. */
  async function unlockApp(page) {
    const unlockModal = page.getByText('Acesso Seguro');
    if (await unlockModal.isVisible()) {
      await page.getByTestId('master-password-input').fill('password123');
      await page.getByRole('button', { name: 'Desbloquear Dados' }).click();
      await expect(unlockModal).not.toBeVisible({ timeout: 10000 });
    }
  }

  test.beforeEach(async ({ page }) => {
    // Logging para debug
    page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
    page.on('console', msg => { if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text()); });

    // Intercepta Auth
    await page.route('**/auth/v1/token*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ 
          access_token: 'fake-token', 
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'mock-refresh',
          user: { id: 'user-123', email: 'test@example.com' } 
        }),
      });
    });

    await page.route('**/auth/v1/user*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'user-123', email: 'test@example.com' }),
      });
    });

    // Mocks Rest API
    await page.route(/.*\/rest\/v1\/.*/, async (route) => {
      const url = route.request().url();
      const method = route.request().method();

      if (method === 'GET') {
        if (url.includes('investment_records')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
              { 
                id: 1, 
                account_id: 1, 
                yield: 120.50, 
                final_balance: 5000.00, 
                record_date: new Date().toISOString().split('T')[0], 
                investment_accounts: { 
                  id: 1,
                  name: 'CDB Inter', 
                  color: '#ff9500',
                  institution: { name: 'Inter' },
                  type: { name: 'Renda Fixa' }
                } 
              }
            ]),
          });
        }

        if (url.includes('investment_accounts')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
              { 
                id: 1, 
                name: 'CDB Inter', 
                color: '#ff9500',
                institution: { name: 'Inter' },
                type: { name: 'Renda Fixa' }
              }
            ]),
          });
        }

        if (url.includes('notification_settings') || url.includes('car_shares')) {
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
        }

        // Fallback para outros GETs (finanças, etc)
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      }

      await route.continue();
    });

    // Dummy Realtime
    await page.route('**/realtime/**', async (route) => {
      await route.fulfill({ status: 200, body: '' });
    });

    await page.addInitScript(() => {
      window.localStorage.clear();
      window.localStorage.setItem('pc_e2e_test', 'true');
    });

    await page.goto('/');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.getByTestId('login-btn').click();

    // Aguarda o Dashboard carregar (Launchpad)
    await page.waitForSelector('header', { timeout: 20000 });
    await expect(page.getByTestId('welcome-message')).toBeVisible({ timeout: 15000 });
    await unlockApp(page);
  });

  test('should display investment dashboard with charts', async ({ page }) => {
    // Navega para Investimentos via Launchpad
    await page.getByTestId('launchpad-item-investments').click({ force: true });
    
    // Aguarda a saída do Launchpad e entrada do sub-header
    await expect(page.getByTestId('welcome-message')).toBeHidden({ timeout: 10000 });
    await expect(page.getByTestId('sub-header')).toBeVisible({ timeout: 10000 });

    // Verifica o título interno do dashboard
    await expect(page.getByTestId('investment-dashboard-main-title')).toBeVisible({ timeout: 15000 });
    
    // Verifica se os dados mockados aparecem (Patrimônio Total)
    // O valor 5.000,00 deve estar formatado como R$ 5.000,00 ou similar
    await expect(page.getByText(/Patrimônio Total|Total Assets/i)).toBeVisible();
    await expect(page.getByText(/5\.?000,00/)).toBeVisible({ timeout: 10000 });
  });

  test('should navigate to investment list', async ({ page }) => {
    // Navega para Investimentos via Launchpad
    await page.getByTestId('launchpad-item-investments').click({ force: true });
    await expect(page.getByTestId('sub-header')).toBeVisible({ timeout: 10000 });
    
    // Clica em "Planilha" no sub-header
    const subItem = page.getByTestId('sidebar-sub-item-investments-list');
    await expect(subItem).toBeVisible({ timeout: 10000 });
    await subItem.click();

    // Confirma navegação via header title (Dashboard.jsx)
    await expect(page.getByTestId('header-title').first()).toHaveText(/Investimentos|Investments/i, { timeout: 15000 });
    
    // Verifica a presença do card de resumo na listagem
    await expect(page.getByTestId('summary-card-total-balance-list')).toBeVisible({ timeout: 15000 });
    // Verifica o valor total na listagem
    await expect(page.getByTestId('summary-card-total-balance-list').getByText(/5\.?000,00/)).toBeVisible();
  });

  test('should auto-populate Initial Balance with previous month Final Balance when creating a new record', async ({ page }) => {
    // Interceptor para requests específicas deste teste
    await page.route('**/rest/v1/investment_records*', async (route) => {
      const url = route.request().url();
      const method = route.request().method();
      
      if (method === 'GET') {
        if (url.includes('select=final_balance') || url.includes('order=record_date.desc')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([{ final_balance: 3450.75 }]),
          });
        }
        
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            { 
              id: 1, 
              account_id: 1, 
              yield: 120.50, 
              final_balance: 5000.00, 
              record_date: new Date().toISOString().split('T')[0], 
              investment_accounts: { 
                id: 1,
                name: 'CDB Inter', 
                color: '#ff9500',
                institution: { name: 'Inter' },
                type: { name: 'Renda Fixa' },
                currency: 'USD'
              } 
            }
          ]),
        });
      }
      await route.continue();
    });

    await page.route('**/rest/v1/investment_accounts*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { 
            id: 1, 
            name: 'CDB Inter', 
            color: '#ff9500',
            institution: { name: 'Inter' },
            type: { name: 'Renda Fixa' },
            currency: 'USD'
          }
        ]),
      });
    });

    await page.getByTestId('launchpad-item-investments').click({ force: true });
    await expect(page.getByTestId('sub-header')).toBeVisible({ timeout: 10000 });
    
    const subItem = page.getByTestId('sidebar-sub-item-investments-list');
    await expect(subItem).toBeVisible({ timeout: 10000 });
    await subItem.click();

    // Abre modal de Novo Registro
    await page.getByRole('button', { name: /Novo Registro/i }).click();

    // Verifica se o Saldo Inicial foi auto-preenchido com o valor mockado
    const initialInput = page.locator('input[placeholder="0,00"]').first();
    await expect(initialInput).toHaveValue('3450,75');
  });
});
