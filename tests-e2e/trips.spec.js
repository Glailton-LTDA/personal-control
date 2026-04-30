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
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 1, name: 'Alimentação', color: '#ff0000' }]) });
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
            currencies: ['EUR', 'BRL'],
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

    // Intercepta Despesas
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
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.locator('aside')).toBeVisible({ timeout: 15000 });
    await unlockApp(page);

    await page.getByRole('button', { name: 'Minhas Viagens' }).click();
    await page.getByRole('button', { name: 'Listagem' }).click();
    
    await expect(page.getByTestId('header-title').first()).toHaveText(/Minhas Viagens/i, { timeout: 15000 });
    await expect(page.getByText('Viagem Teste').first()).toBeVisible({ timeout: 15000 });
    
    // Abre detalhes
    await page.getByLabel('Menu da Viagem').click();
    await page.getByTestId('view-trip-details-btn').click();

    await expect(page.getByTestId('trip-details-title')).toBeVisible({ timeout: 10000 });
    const locationDiv = page.getByTestId('trip-details-location');
    await expect(locationDiv).toContainText('Paris');
    
    // Seleciona EUR para ver os gastos mockados
    await page.getByTestId('currency-select-EUR').click();
    
    await expect(page.getByTestId('expense-desc-0')).toContainText('Jantar de Luxo');
    await expect(page.getByTestId('expense-desc-1')).toContainText('Uber Aeroporto');
  });

  test('deve persistir a moeda selecionada por viagem no localStorage', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await unlockApp(page);
    
    await page.getByRole('button', { name: 'Minhas Viagens' }).click();
    await page.getByRole('button', { name: 'Listagem' }).click();
    
    // Seleciona a viagem para abrir os detalhes
    await page.getByTestId('trip-select-trip-1').click();
    await expect(page.getByTestId('trip-details-title')).toBeVisible();
    
    // Clica no botão de moeda BRL para forçar a persistência
    await page.getByTestId('currency-select-BRL').click();
    
    await expect.poll(async () => {
      return await page.evaluate(() => localStorage.getItem('pc_trip_trip-1_currency'));
    }).toBe('BRL');
  });

  test('deve navegar para o roteiro completo e voltar para a listagem', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await unlockApp(page);
    
    await page.getByRole('button', { name: 'Minhas Viagens' }).click();
    await page.getByRole('button', { name: 'Listagem' }).click();
    
    await page.getByLabel('Menu da Viagem').click();
    await page.getByTestId('view-itinerary-btn').click();
    
    await expect(page.getByRole('heading', { name: /Roteiro/i }).first()).toBeVisible();
    await page.getByTestId('back-button').click();
    await expect(page.getByTestId('header-title').first()).toHaveText(/Minhas Viagens/i);
  });
});
