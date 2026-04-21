import { test, expect } from '@playwright/test';

test.describe('Autenticação e Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Intercepta chamadas do Supabase Auth
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

    const currentYear = new Date().getFullYear();
    const currentMonthPrefix = `${currentYear}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

    // Intercepta chamadas de dados do Dashboard
    await page.route('**/rest/v1/finances*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 1, amount: 1000, type: 'RECEITA', category: 'Salário', payment_date: `${currentMonthPrefix}-01`, status: 'PAGO' },
          { id: 2, amount: 500, type: 'DESPESA', category: 'Aluguel', payment_date: `${currentMonthPrefix}-05`, status: 'PENDENTE' },
        ]),
      });
    });

    await page.route('**/rest/v1/finance_responsibles*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ name: 'João' }]),
      });
    });
  });

  test('deve fazer login e visualizar o dashboard', async ({ page }) => {
    await page.goto('/');

    // Preenche login
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button:has-text("Entrar")');

    // Espera a navegação e carregamento inicial
    await page.waitForLoadState('networkidle');

    // Verifica dados mockados nos cards específicos
    const incomeCard = page.locator('.glass-card', { hasText: /Receita (Anual|Mensal)/i });
    const balanceCard = page.locator('.glass-card', { hasText: /Saldo Final/i });

    await expect(incomeCard.getByText(/1\.?000,00/i)).toBeVisible();
    await expect(balanceCard.getByText(/500,00/i)).toBeVisible();
  });
});
