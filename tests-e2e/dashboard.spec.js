import { test, expect } from '@playwright/test';

test.describe('Autenticação e Dashboard', () => {
  /** Desbloqueia o app com a senha mestre padrão para testes. */
  async function unlockApp(page) {
    const unlockModal = page.getByText('Acesso Seguro');
    if (await unlockModal.isVisible()) {
      await page.getByTestId('master-password-input').fill('password123');
      await page.getByRole('button', { name: 'Desbloquear Dados' }).click();
      await expect(unlockModal).not.toBeVisible();
    }
  }

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
    await unlockApp(page);

    // Espera a navegação e carregamento inicial
    await page.waitForLoadState('networkidle');

    // Verifica dados mockados nos cards específicos
    const incomeCard = page.locator('.glass-card', { hasText: /Receita (Anual|Mensal)/i });
    const balanceCard = page.locator('.glass-card', { hasText: /Saldo Final/i });

    await expect(incomeCard.getByText(/1\.?000,00/i)).toBeVisible();
    await expect(balanceCard.getByText(/500,00/i)).toBeVisible();
  });

  test('deve alternar o modo de privacidade (ocultar valores)', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button:has-text("Entrar")');
    await page.waitForLoadState('networkidle');

    // Valor deve estar visível inicialmente
    const incomeValue = page.locator('.glass-card', { hasText: /Receita (Anual|Mensal)/i }).getByText(/1\.?000,00/i);
    await expect(incomeValue).toBeVisible();

    // Clica no botão de privacidade
    // Usamos o título que o componente define
    await page.click('button[title="Ocultar Valores"]');

    // Valor deve estar mascarado
    await expect(page.getByText(/R\$.*••••••/i).first()).toBeVisible();
    await expect(incomeValue).not.toBeVisible();

    // Alterna de volta
    await page.click('button[title="Mostrar Valores"]');
    await expect(incomeValue).toBeVisible();
  });

  test('deve colapsar e expandir seções do menu lateral', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button:has-text("Entrar")');
    await page.waitForLoadState('networkidle');

    // A seção "FINANÇAS" deve estar expandida por padrão e mostrar "Transações"
    const transactionsLink = page.getByRole('button', { name: 'Transações' });
    await expect(transactionsLink).toBeVisible();

    // Clica no header da seção (o label pequeno "Finanças")
    await page.click('small:has-text("Finanças")');

    // "Transações" deve estar oculto
    await expect(transactionsLink).not.toBeVisible();

    // Clica novamente para expandir
    await page.click('small:has-text("Finanças")');
    await expect(transactionsLink).toBeVisible();
  });
});
