import { test, expect } from '@playwright/test';

test.describe('Minha Jornada (Stats)', () => {
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

    // Intercepta User (fallback)
    await page.route('**/auth/v1/user*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'user-123', email: 'test@example.com' }),
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
            title: 'Viagem Europa',
            countries: ['França', 'Itália'],
            cities: ['Paris', 'Roma'],
            start_date: '2024-05-01',
            end_date: '2024-05-15',
            user_id: 'user-123'
          },
          {
            id: 'trip-2',
            title: 'Viagem Brasil',
            countries: ['Brasil'],
            cities: ['Fortaleza'],
            start_date: '2024-06-01',
            end_date: '2024-06-05',
            user_id: 'user-123'
          }
        ]),
      });
    });

    // Intercepta Categorias
    await page.route('**/rest/v1/trip_categories*', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify([]) });
    });

    // Intercepta Despesas (vazio para simplificar)
    await page.route('**/rest/v1/trip_expenses*', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify([]) });
    });

    await page.addInitScript(() => {
      window.localStorage.setItem('pc_e2e_test', 'true');
    });
    await page.goto('/');
    // Login
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.getByRole('button', { name: 'Entrar' }).click();
    
    // Aguarda o Dashboard carregar e navega para Viagens
    await expect(page.getByText('Personal')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Minhas Viagens' }).click();
    
    // Verifica se carregou
    await expect(page.getByRole('heading', { name: 'Minhas Viagens' })).toBeVisible();
  });

  test('deve navegar para Minha Jornada via sidebar e exibir estatísticas', async ({ page }) => {
    // Clica no botão "Minha Jornada" na sidebar
    const journeySidebarBtn = page.getByRole('button', { name: 'Minha Jornada' });
    await expect(journeySidebarBtn).toBeVisible();
    await journeySidebarBtn.click();

    // Verifica se o título da página mudou
    await expect(page.getByRole('heading', { name: 'Minha Jornada' })).toBeVisible();

    // Verifica se as estatísticas básicas estão lá
    await expect(page.getByText('Total de Viagens')).toBeVisible();
    await expect(page.getByText('Países Visitados', { exact: false })).toHaveCount(2); // Card and section header
    
    // Verifica se os países do mock aparecem na lista
    await expect(page.getByText('França')).toBeVisible();
    await expect(page.getByText('Itália')).toBeVisible();
    await expect(page.getByText('Brasil')).toBeVisible();

    // Testa o botão voltar
    await page.getByTestId('back-to-trips-btn').click();
    await expect(page.getByRole('heading', { name: 'Minha Jornada' })).not.toBeVisible();
    await expect(page.getByText('Viagem Europa').first()).toBeVisible();
  });
});
