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

    // Navega para Finanças via Launchpad
    await page.getByTestId('launchpad-item-finances').click();
    await page.waitForLoadState('networkidle');

    // Verifica dados mockados nos cards específicos via data-testid
    const incomeCard = page.getByTestId('stat-card-income');
    const balanceCard = page.getByTestId('stat-card-balance');

    await expect(incomeCard.getByText(/1\.?000,00/i)).toBeVisible();
    await expect(balanceCard.getByText(/500,00/i)).toBeVisible();
  });

  test('deve alternar o modo de privacidade (ocultar valores)', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button:has-text("Entrar")');
    await page.waitForLoadState('networkidle');
    await unlockApp(page);
    
    // Navega para Finanças via Launchpad
    await page.getByTestId('launchpad-item-finances').click();
    await page.waitForLoadState('networkidle');

    // Valor deve estar visível inicialmente
    const incomeValue = page.getByTestId('stat-card-income').getByText(/1\.?000,00/i);
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

  test('deve exibir o card de total pendente (Falta Pagar) na lista de movimentações de despesa', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button:has-text("Entrar")');
    await page.waitForLoadState('networkidle');
    await unlockApp(page);
    
    // Navega para Finanças via Launchpad
    await page.getByTestId('launchpad-item-finances').click();
    await page.waitForLoadState('networkidle');

    // Alterna para o submenu de Transações
    await page.click('a:has-text("Transações")');
    await page.waitForLoadState('networkidle');

    // Por padrão a aba DESPESA está ativa.
    // O total acumulado de despesas pendentes deve ser 500,00 (do aluguel pendente de 500)
    const pendingTotalCard = page.getByTestId('pending-total-card');
    await expect(pendingTotalCard).toBeVisible();
    await expect(pendingTotalCard.getByText(/500,00/i)).toBeVisible();

    // Alterna para a aba de Receitas (revenues)
    await page.click('button:has-text("Receitas")');

    // O card de despesas pendentes não deve ser exibido na aba de Receitas
    await expect(pendingTotalCard).not.toBeVisible();
  });

  test('deve ocultar e exibir módulos na navegação com base nas configurações de visibilidade', async ({ page }) => {
    let currentVisibleModules = ['launchpad', 'finances', 'settings'];
    let upsertedData = null;

    await page.route('**/rest/v1/notification_settings*', async (route) => {
      const method = route.request().method();
      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            recipient_email: 'test@example.com',
            bcc_email: '',
            menu_order: ['launchpad', 'finances', 'cars', 'settings'],
            visible_modules: currentVisibleModules,
            skip_email_modal: false,
            auto_send_on_paid: false,
            skip_confirmations: false
          })
        });
      } else if (method === 'POST') {
        const payload = JSON.parse(route.request().postData());
        upsertedData = payload;
        if (payload.visible_modules) {
          currentVisibleModules = payload.visible_modules;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(payload)
        });
      }
    });

    await page.goto('/');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button:has-text("Entrar")');
    await page.waitForLoadState('networkidle');
    await unlockApp(page);

    // Módulo Finanças deve estar visível no menu
    await expect(page.getByTestId('sidebar-group-finances')).toBeVisible();

    // Módulo Carros NÃO deve estar visível no menu
    await expect(page.getByTestId('sidebar-group-cars')).not.toBeVisible();

    // Navega para Ajustes
    await page.getByTestId('sidebar-group-settings').click();
    await page.waitForLoadState('networkidle');

    // Módulo Carros deve aparecer na lista de Módulos Visíveis em Ajustes como desmarcado
    const carsVisibilityCheck = page.getByTestId('module-visibility-check-cars');
    await expect(carsVisibilityCheck).not.toBeChecked();

    // Marca o módulo Carros
    await page.click('label[data-testid="module-visibility-row-cars"]');
    await expect(carsVisibilityCheck).toBeChecked();

    // Clica em Salvar Configurações
    await page.getByTestId('save-settings-button').click();
    await page.waitForLoadState('networkidle');

    // Verifica que o payload foi enviado ao Supabase contendo 'cars' nos módulos visíveis
    expect(upsertedData).not.toBeNull();
    expect(upsertedData.visible_modules).toContain('cars');

    // Agora o módulo Carros deve estar visível no menu
    await expect(page.getByTestId('sidebar-group-cars')).toBeVisible();
  });
});

