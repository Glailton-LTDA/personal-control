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
    page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
    page.on('console', msg => { if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text()); });
    // Intercepta Auth
    await page.route('**/auth/v1/token*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock.token.signature',
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'mock-refresh',
          user: { id: 'user-123', email: 'test@example.com' },
        }),
      });
    });

    // 1. Catch-all Supabase (Regex) - Deve vir primeiro e usar route.continue() se não quiser tratar
    await page.route(/.*\/rest\/v1\/.*/, async (route) => {
      const url = route.request().url();
      const method = route.request().method();

      if (method === 'GET') {
        // Mocks específicos dentro do handler único para garantir ordem
        if (url.includes('/trips?')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([{
              id: 'trip-1',
              title: 'Viagem Teste',
              currencies: ['EUR', 'BRL'],
              daily_limits: { EUR: 100 },
              countries: ['França'],
              cities: ['Paris'],
              participants: ['João'],
              start_date: '2024-05-01',
              end_date: '2024-05-10',
              user_id: 'user-123'
            }])
          });
        }
        
        if (url.includes('/trip_expenses?')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
              { id: 'exp-1', amount: 150, currency: 'EUR', description: 'Jantar de Luxo', date: '2024-05-02', paid_by: 'João', trip_categories: { name: 'Alimentação', color: '#ff0000' } },
              { id: 'exp-2', amount: 25, currency: 'EUR', description: 'Uber Aeroporto', date: '2024-05-02', paid_by: 'João', trip_categories: { name: 'Transporte', color: '#06b6d4' } }
            ])
          });
        }

        if (url.includes('/trip_categories?')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([{ id: 1, name: 'Alimentação', color: '#ff0000' }])
          });
        }

        // Default empty for other GETs (itinerary, settings, etc)
        console.log('MOCKING DEFAULT GET:', url);
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([])
        });
      }
      
      await route.continue();
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
    
    // Aguarda o Dashboard carregar (Launchpad)
    await page.waitForSelector('header', { timeout: 20000 });
    await expect(page.getByText('Olá,')).toBeVisible({ timeout: 15000 });
    await unlockApp(page);

    // Navega para Viagens via Launchpad
    await page.getByTestId('launchpad-item-trips').click();
    await page.waitForLoadState('networkidle');
    
    // Verifica se o sub-header de viagens apareceu e clica em Listagem
    await expect(page.getByTestId('sub-header')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('sidebar-sub-item-trips-list').click();
    
    await expect(page.getByTestId('header-title').first()).toHaveText(/Viagens/i, { timeout: 15000 });
    await expect(page.getByText('Viagem Teste').first()).toBeVisible({ timeout: 15000 });
    
    // Abre detalhes
    await page.getByLabel('Menu da Viagem').click();
    await page.getByTestId('view-trip-details-btn').click();

    // Wait a bit for render
    await page.waitForTimeout(1000);
    // Dump DOM
    const html = await page.evaluate(() => document.body.innerHTML);
    console.log(html.substring(0, 5000));
    
    await page.screenshot({ path: 'test-results/debug-trip-details.png', fullPage: true });
    await expect(page.getByTestId('trip-details-title')).toBeVisible({ timeout: 10000 });
    const locationDiv = page.getByTestId('trip-details-location');
    await expect(locationDiv).toContainText('Paris');
    
    // Seleciona EUR para ver os gastos mockados
    await page.getByTestId('currency-select-EUR').click();
    
    // Close details to see expenses in the list
    await page.getByTestId('trip-details-back-btn').click();
    
    await page.waitForTimeout(500);
    await expect(page.getByText('Jantar de Luxo').filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText('Uber Aeroporto').filter({ visible: true }).first()).toBeVisible();
  });

  test('deve persistir a moeda selecionada por viagem no localStorage', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.getByRole('button', { name: 'Entrar' }).click();
    
    // Aguarda o Dashboard carregar (Launchpad)
    await page.waitForSelector('header', { timeout: 20000 });
    await unlockApp(page);
    
    // Navega para Viagens via Launchpad
    await page.getByTestId('launchpad-item-trips').click();
    await page.waitForLoadState('networkidle');
    
    // Verifica se o sub-header de viagens apareceu e clica em Listagem
    await expect(page.getByTestId('sub-header')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('sidebar-sub-item-trips-list').click();
    
    // Abre detalhes via menu de ações
    await page.getByLabel('Menu da Viagem').click();
    await page.getByTestId('view-trip-details-btn').click();
    await expect(page.getByTestId('trip-details-title')).toBeVisible({ timeout: 15000 });
    
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
    
    // Aguarda o Dashboard carregar (Launchpad)
    await page.waitForSelector('header', { timeout: 20000 });
    await unlockApp(page);
    
    // Navega para Viagens via Launchpad
    await page.getByTestId('launchpad-item-trips').click();
    await page.waitForLoadState('networkidle');
    
    // Verifica se o sub-header de viagens apareceu e clica em Listagem
    await expect(page.getByTestId('sub-header')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('sidebar-sub-item-trips-list').click();
    
    await page.getByLabel('Menu da Viagem').click();
    await page.getByTestId('view-itinerary-btn').click();
    
    await expect(page.getByRole('heading', { name: /Roteiro/i }).first()).toBeVisible();
    await page.getByTestId('back-button').click();
    await expect(page.getByTestId('header-title').first()).toHaveText(/Viagens/i);
  });
});
