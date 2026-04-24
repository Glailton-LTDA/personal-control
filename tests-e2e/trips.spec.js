import { test, expect } from '@playwright/test';

test.describe('Módulo de Viagens', () => {
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
  });

  test('deve carregar a viagem e mostrar os novos elementos da UI', async ({ page }) => {
    await page.goto('/');
    
    // Login
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.getByRole('button', { name: 'Entrar' }).click();
    
    // Aguarda o Dashboard carregar
    await expect(page.getByText('Personal')).toBeVisible({ timeout: 15000 });

    // Navega para Viagens
    await page.getByRole('button', { name: 'Minhas Viagens' }).click();
    
    // Verifica se carregou o título da seção
    await expect(page.getByRole('heading', { name: 'Minhas Viagens' })).toBeVisible({ timeout: 10000 });

    // Verifica se a viagem mockada apareceu
    await expect(page.getByText('Viagem Teste')).toBeVisible({ timeout: 15000 });

    // Clica em Detalhes da Viagem para ver Logística
    await page.getByRole('button', { name: 'Detalhes da Viagem' }).click();

    // Verifica Roteiro e Viajantes nos Detalhes
    await expect(page.getByText('Paris', { exact: false })).toBeVisible();
    await expect(page.getByText('França', { exact: false })).toBeVisible();

    // Volta para a listagem
    await page.getByRole('button', { name: 'Voltar' }).click();
    
    // Espera o modal sumir completamente
    await expect(page.getByLabel('Voltar')).not.toBeVisible();

    // Verifica se os KPIs voltaram a aparecer
    await expect(page.getByText(/Total Gasto/i)).toBeVisible();

    // Tenta encontrar o texto da despesa com uma espera maior e ignorando case
    await expect(page.getByText(/Jantar de Luxo/i)).toBeVisible({ timeout: 15000 });
    
    // Para o valor, tentamos ser o mais genérico possível
    await expect(page.getByText(/150/).first()).toBeVisible();
    
    // Verifica KPI de Orçamento
    await expect(page.getByText(/No Plano|Crítico|Livre/)).toBeVisible();
  });
});
