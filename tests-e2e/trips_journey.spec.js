import { test, expect } from '@playwright/test';

test.describe('Minha Jornada (Stats)', () => {
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

    // Intercepta User (fallback)
    await page.route('**/auth/v1/user*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'user-123', email: 'test@example.com' }),
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
            countries: ['França', 'Itália', 'Brasil'],
            cities: ['Paris', 'Roma', 'Natal'],
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
    
    await unlockApp(page);
    
    const tripsGroup = page.getByTestId('sidebar-group-trips');
    await tripsGroup.click({ force: true });
    const listBtn = page.getByTestId('sidebar-sub-item-trips-list');
    if (!(await listBtn.isVisible())) {
       await tripsGroup.click({ force: true });
    }
    await listBtn.click({ force: true });
    
    // Verifica se carregou
    await expect(page.getByTestId('header-title')).toContainText('Minhas Viagens');
  });

  test('deve navegar para Minha Jornada via sidebar e exibir estatísticas', async ({ page }) => {
    // Navega para Minha Jornada
    await page.getByTestId('sidebar-sub-item-trips-stats').click();

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
    await expect(page.getByText('Viagem Teste').first()).toBeVisible();
  });
});
