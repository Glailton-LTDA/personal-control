import { test, expect } from '@playwright/test';

test.describe('Viagens - Checklists (TODOs)', () => {
  let checklistsData = [];

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
    
    // Aguardar Dashboard via DOM (espera pelo header do novo layout)
    await page.waitForSelector('header', { timeout: 20000 });
    await expect(page.getByTestId('welcome-message')).toBeVisible({ timeout: 15000 });
    await unlockApp(page);

    // Navega para Viagens via Launchpad
    await page.getByTestId('launchpad-item-trips').click();
    await page.waitForLoadState('networkidle');
    
    // Agora verifica se a lista de viagens está visível (sub-item)
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

    checklistsData = [
      { 
        id: 'checklist-alpha', 
        title: 'Mala de Mão', 
        trip_id: 'trip-1',
        items: [
          { id: 'task-alpha', task: 'Passaporte', completed: false, checklist_id: 'checklist-alpha', created_at: new Date().toISOString() }
        ]
      }
    ];

    await page.route('**/rest/v1/trip_checklists*', async (route) => {
      const method = route.request().method();
      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(checklistsData),
        });
      } else if (method === 'POST') {
        const body = JSON.parse(route.request().postData() || '{}');
        const payload = Array.isArray(body) ? body[0] : body;
        const newChecklist = {
          id: payload.id || 'checklist-' + Math.random().toString(36).substring(2, 11),
          title: payload.title,
          trip_id: payload.trip_id || 'trip-1',
          items: []
        };
        checklistsData.push(newChecklist);
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(newChecklist),
        });
      } else if (method === 'PATCH' || method === 'PUT') {
        const body = JSON.parse(route.request().postData() || '{}');
        const payload = Array.isArray(body) ? body[0] : body;
        const url = route.request().url();
        const idMatch = url.match(/id=eq\.([^&]+)/);
        const id = idMatch ? idMatch[1] : null;
        if (id) {
          checklistsData = checklistsData.map(c => c.id === id ? { ...c, ...payload } : c);
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      }
    });

    await page.route('**/rest/v1/trip_checklist_items*', async (route) => {
      const method = route.request().method();
      if (method === 'POST') {
        const body = JSON.parse(route.request().postData() || '{}');
        const payload = Array.isArray(body) ? body[0] : body;
        const newItem = {
          id: payload.id || 'item-' + Math.random().toString(36).substring(2, 11),
          checklist_id: payload.checklist_id,
          task: payload.task,
          completed: payload.completed || false,
          created_at: new Date().toISOString()
        };
        checklistsData = checklistsData.map(c => {
          if (c.id === payload.checklist_id) {
            return { ...c, items: [...(c.items || []), newItem] };
          }
          return c;
        });
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(newItem),
        });
      } else if (method === 'PATCH' || method === 'PUT') {
        const body = JSON.parse(route.request().postData() || '{}');
        const payload = Array.isArray(body) ? body[0] : body;
        const url = route.request().url();
        const idMatch = url.match(/id=eq\.([^&]+)/);
        const id = idMatch ? idMatch[1] : null;
        if (id) {
          checklistsData = checklistsData.map(c => ({
            ...c,
            items: (c.items || []).map(item => item.id === id ? { ...item, ...payload } : item)
          }));
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      }
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
    await page.getByTestId('trip-actions-menu-btn').click();
    await page.getByTestId('view-checklists-btn').click();
    await expect(page.getByTestId('checklists-title')).toBeVisible();
  }

  test('deve criar uma nova lista e adicionar itens', async ({ page }) => {
    await goToChecklists(page);
    await page.getByTestId('btn-add-checklist').click();
    await page.getByPlaceholder('Ex: Documentos, Mala de Mão...').fill('Nova Lista E2E');
    await page.getByTestId('create-list-btn').click();
    await expect(page.getByText('Nova Lista E2E')).toBeVisible();
  });

  test('deve editar um item existente', async ({ page }) => {
    await goToChecklists(page);
    const taskName = page.getByTestId('checklist-item-task-task-alpha');
    await taskName.click();
    const input = page.getByTestId('edit-item-input-task-alpha');
    await input.fill('Passaporte Atualizado');
    await input.press('Enter');
    await expect(page.getByTestId('checklist-item-task-task-alpha')).toContainText('Passaporte Atualizado');
  });

  test('deve colapsar e expandir uma lista', async ({ page }) => {
    await goToChecklists(page);
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('checklist-title-checklist-alpha')).toBeVisible({ timeout: 10000 });
    
    // Ensure item is visible first
    const taskItem = page.getByTestId('checklist-item-task-task-alpha');
    await expect(taskItem).toBeVisible({ timeout: 15000 });
    
    // Collapse
    await page.getByTestId('checklist-title-checklist-alpha').click({ force: true });
    await expect(taskItem).toBeHidden({ timeout: 10000 });
    
    // Expand
    await page.getByTestId('checklist-title-checklist-alpha').click({ force: true });
    // Wait for animation
    await page.waitForTimeout(500); 
    await expect(taskItem).toBeVisible({ timeout: 15000 });
  });

  test('deve abrir o modal de importação', async ({ page }) => {
    await goToChecklists(page);
    await page.getByTestId('import-checklist-btn').click();
    await expect(page.getByText(/Importar de outras viagens|Import from other trips|Importar de otros viajes/i)).toBeVisible();
  });
});
