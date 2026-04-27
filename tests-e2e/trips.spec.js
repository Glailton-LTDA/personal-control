import { test, expect } from '@playwright/test';

test.describe('Módulo de Viagens', () => {
  /** Desbloqueia o app com a senha mestre padrão para testes. */
  async function unlockApp(page) {
    const unlockModal = page.getByText('Acesso Seguro');
    if (await unlockModal.isVisible()) {
      await page.getByTestId('master-password-input').fill('password123');
      await page.getByRole('button', { name: 'Desbloquear Dados' }).click();
      await expect(unlockModal).not.toBeVisible({ timeout: 10000 });
    }
  }

  test.beforeEach(async ({ page }) => {
    // Intercepta Auth
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

    // Intercepta Categorias
    await page.route('**/rest/v1/trip_categories*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 1, name: 'Alimentação', color: '#ff0000' }]),
      });
    });

    // Intercepta Viagens
    await page.route('**/rest/v1/trips*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'trip-1',
            title: 'Viagem Teste',
            currencies: ['EUR'],
            daily_limits: { EUR: 100 },
            countries: ['França'],
            cities: ['Paris'],
            participants: ['João'],
            hotels: [],
            transports: [],
            start_date: '2024-05-01',
            end_date: '2024-05-10',
            user_id: 'user-123'
          }
        ]),
      });
    });

    // Intercepta Despesas - Especificamente para a trip-1 e EUR
    await page.route('**/rest/v1/trip_expenses*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'exp-1',
            amount: 150,
            currency: 'EUR',
            description: 'Jantar de Luxo',
            date: '2024-05-02',
            paid_by: 'João',
            trip_categories: { name: 'Alimentação', color: '#ff0000' }
          }
        ]),
      });
    });
    await page.addInitScript(() => {
      window.localStorage.setItem('pc_e2e_test', 'true');
    });
  });

  test('deve carregar a viagem e mostrar os novos elementos da UI', async ({ page }) => {
    await page.goto('/');
    
    // Login
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.getByRole('button', { name: 'Entrar' }).click();
    
    // Aguarda o Dashboard carregar e desbloqueia os dados
    await expect(page.getByText('Personal')).toBeVisible({ timeout: 15000 });
    await unlockApp(page);

    // Navega para Viagens
    await page.getByRole('button', { name: 'Minhas Viagens' }).click();
    await page.getByRole('button', { name: 'Listagem' }).click();
    
    // Verifica se carregou o título da seção
    await expect(page.getByTestId('header-title').first()).toHaveText(/Minhas Viagens/i, { timeout: 15000 });

    // Verifica se a viagem mockada apareceu
    await expect(page.getByText('Viagem Teste').first()).toBeVisible({ timeout: 15000 });
    
    // Seleciona a viagem explicitamente pelo ID do mock
    await page.getByTestId('trip-tab-trip-1').click();
    await page.waitForTimeout(1000);

    // Clica em Detalhes da Viagem para ver Logística
    await page.getByTestId('view-trip-details-btn').click();

    // Espera o modal aparecer pelo título
    await expect(page.getByTestId('trip-details-title')).toBeVisible({ timeout: 10000 });

    // Verifica Roteiro e Viajantes nos Detalhes
    // Espera o texto Paris aparecer na localização
    const locationDiv = page.getByTestId('trip-details-location');
    await expect(locationDiv).toBeVisible({ timeout: 10000 });
    await expect(locationDiv).toContainText('Paris');
    
    // Verifica despesa na seção de Despesas Recentes
    await expect(page.getByTestId('expense-desc-0')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('expense-desc-0')).toContainText('Jantar de Luxo');
    
    // Verifica KPI de Orçamento
    await expect(page.getByText(/No Plano|Crítico|Livre/).first()).toBeVisible();
  });

  test('deve persistir a moeda selecionada por viagem no localStorage', async ({ page }) => {
    await page.goto('/');
    
    // Login
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await unlockApp(page);
    
    // Navega para Viagens
    await page.getByRole('button', { name: 'Minhas Viagens' }).click();
    await page.getByRole('button', { name: 'Listagem' }).click();
    
    // Verifica se o seletor de moeda para EUR está ativo e salva no localStorage
    await expect(page.getByRole('button', { name: /EUR/ })).toBeVisible();
    
    // Verifica se o valor foi persistido com polling
    await expect.poll(async () => {
      return await page.evaluate(() => localStorage.getItem('pc_trip_trip-1_currency'));
    }).toBe('EUR');
  });

  test('deve navegar para o roteiro completo e voltar para a listagem', async ({ page }) => {
    await page.goto('/');
    
    // Login
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await unlockApp(page);
    
    // Navega para Viagens
    await page.getByRole('button', { name: 'Minhas Viagens' }).click();
    await page.getByRole('button', { name: 'Listagem' }).click();
    
    // Abre detalhes da viagem
    await page.getByTestId('view-trip-details-btn').click();
    
    // Clica em "EDITAR ROTEIRO COMPLETO"
    await page.getByRole('button', { name: 'EDITAR ROTEIRO COMPLETO' }).click();
    
    // Verifica se mudou para a tela de roteiro (que tem o título "Roteiros" ou similar)
    // O seletor depende de como o TripsItinerary renderiza o título
    await expect(page.getByRole('heading', { name: 'Roteiros' })).toBeVisible();
    
    // Clica no botão de voltar do roteiro
    await page.getByTestId('back-button').click();
    
    // Verifica se voltou para a listagem de viagens
    await expect(page.getByRole('heading', { name: 'Minhas Viagens' })).toBeVisible();
  });
});
