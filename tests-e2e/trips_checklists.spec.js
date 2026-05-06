import { test, expect } from '@playwright/test';

test.describe('Viagens - Checklists (TODOs)', () => {
  /** Desbloqueia o app com a senha mestre padrão para testes. */
  async function unlockApp(page) {
    const unlockModal = page.getByText('Acesso Seguro');
    if (await unlockModal.isVisible()) {
      await page.getByTestId('master-password-input').fill('password123');
      await page.getByRole('button', { name: 'Desbloquear Dados' }).click();
      await expect(unlockModal).not.toBeVisible({ timeout: 10000 });
    }
  }

  async function loginAndGoToTrips(page) {
    await page.goto('/');
    await page.waitForSelector('input[type="email"]', { timeout: 15000 });
    await page.locator('input[type="email"]').fill('test@example.com');
    await page.locator('input[type="password"]').fill('password123');
    await page.getByRole('button', { name: /entrar/i }).click();
    
    await expect(page.locator('aside')).toBeVisible({ timeout: 20000 });
    await unlockApp(page);

    await page.getByTestId('sidebar-group-trips').click();
    await expect(page.getByTestId('sidebar-sub-item-trips-list')).toBeVisible({ timeout: 10000 });
  }

  test.beforeEach(async ({ page }) => {
    // Intercept login
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

    // Mock Other REST calls
    await page.route('**/rest/v1/*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
      }
    });

    // Mock Notification Settings
    await page.route('**/rest/v1/notification_settings*', async (route) => {
      await route.fulfill({ 
        status: 200, 
        contentType: 'application/json', 
        body: JSON.stringify({ 
          recipient_email: 'test@example.com',
          skip_confirmations: false 
        }) 
      });
    });

    // Mock Trip Checklists
    await page.route('**/rest/v1/trip_checklists*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'list-1', title: 'Mala de Mão', trip_id: 'trip-1' }
        ]),
      });
    });

    // Mock Trip Checklist Items
    await page.route('**/rest/v1/trip_checklist_items*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'item-1', task: 'Passaporte', completed: false, checklist_id: 'list-1' }
        ]),
      });
    });

    // Mock Trips
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
            tickets: [],
            misc_docs: [],
            user_id: 'user-123',
            start_date: '2024-05-01',
            end_date: '2024-05-10'
          }
        ]),
      });
    });

    await page.addInitScript(() => {
      window.localStorage.setItem('pc_e2e_test', 'true');
    });
  });

  async function goToChecklists(page) {
    await loginAndGoToTrips(page);
    await page.getByTestId('sidebar-sub-item-trips-list').click();
    await expect(page.getByTestId('trip-selector')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('trip-selector').click();
    await page.getByTestId('trip-select-trip-1').click();
    await expect(page.getByTestId('trip-details-title')).toBeVisible({ timeout: 10000 });
    await page.getByLabel('Menu da Viagem').click();
    await page.getByTestId('view-checklists-btn').click();
    await expect(page.getByText('Checklists de Viagem')).toBeVisible();
  }

  test('deve criar uma nova lista e adicionar itens', async ({ page }) => {
    await goToChecklists(page);
    await page.getByTestId('btn-add-checklist').click();
    await page.getByPlaceholder('Ex: Documentos, Mala de Mão...').fill('Nova Lista E2E');
    await page.getByRole('button', { name: /criar lista/i }).click();
    await expect(page.getByText('Nova Lista E2E')).toBeVisible();
  });

  test('deve editar um item existente', async ({ page }) => {
    await goToChecklists(page);
    const taskName = page.getByTestId('checklist-item-task-item-1');
    await taskName.click();
    const input = page.getByTestId('edit-item-input-item-1');
    await input.fill('Passaporte Atualizado');
    await input.press('Enter');
    await expect(page.getByTestId('checklist-item-task-item-1')).toContainText('Passaporte Atualizado');
  });

  test('deve colapsar e expandir uma lista', async ({ page }) => {
    await goToChecklists(page);
    await expect(page.getByTestId('checklist-item-task-item-1')).toBeVisible();
    await page.getByTestId('checklist-toggle-list-1').click();
    // Espera o item sumir (ele é removido do DOM no colapso)
    await expect(page.getByTestId('checklist-item-task-item-1')).not.toBeVisible();
    await page.getByTestId('checklist-toggle-list-1').click();
    await expect(page.getByTestId('checklist-item-task-item-1')).toBeVisible();
  });

  test('deve abrir o modal de importação', async ({ page }) => {
    await goToChecklists(page);
    await page.getByRole('button', { name: /importar/i }).click();
    await expect(page.getByText('Importar de outras viagens')).toBeVisible();
  });
});
