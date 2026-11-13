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
    await expect(taskItem).toBeVisible({ timeout: 15000 });
  });

  test('deve abrir o modal de importação', async ({ page }) => {
    await goToChecklists(page);
    await page.getByTestId('import-checklist-btn').click();
    await expect(page.getByText(/Importar de outras viagens|Import from other trips|Importar de otros viajes/i)).toBeVisible();
  });

  test('deve importar no celular e reabrir os checklists após recarregar', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { configurable: true, value: true }));
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await goToChecklists(page);
    await page.evaluate(async () => {
      const { db } = await import('/src/lib/offline/db.js');
      await db.trips.put({ id: 'trip-source', user_id: 'user-123', title: 'Viagem de origem' });
      await db.trip_checklists.put({ id: 'list-source', trip_id: 'trip-source', title: 'Lista de origem' });
      await db.trip_checklist_items.put({ id: 'item-source', checklist_id: 'list-source', task: 'Carregador', completed: true });
    });
    // Include the source trip in the server response as well as the offline cache.
    await page.route('**/rest/v1/trips*', async route => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify([
        { id: 'trip-1', user_id: 'user-123', title: 'Viagem Teste', currencies: ['BRL'] },
        { id: 'trip-source', user_id: 'user-123', title: 'Viagem de origem', currencies: ['BRL'] },
      ]),
    }));
    const tripsRefetched = page.waitForResponse(response => response.url().includes('/rest/v1/trips?'));
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('database-synced', { detail: { source: 'trips' } })));
    await tripsRefetched;
    await page.getByTestId('import-checklist-btn').click();
    const dialog = page.getByRole('dialog', { name: 'Importar de outras viagens' });
    await expect(dialog.getByRole('button', { name: 'Lista de origem', exact: true })).toBeVisible();
    await dialog.getByText('Viagem de origem', { exact: true }).evaluate(target => {
      // WebKit does not expose Touch constructors on every platform.
      const touch = (type, touches) => {
        const event = new Event(type, { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'touches', { value: touches });
        target.dispatchEvent(event);
      };
      touch('touchstart', [{ clientX: 100, clientY: 100 }]);
      touch('touchmove', [{ clientX: 100, clientY: 200 }]);
      touch('touchend', []);
    });
    await expect(page.locator('.pull-to-refresh-container')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(dialog).toBeHidden();
    await page.getByTestId('import-checklist-btn').click();
    await page.getByRole('button', { name: 'Lista de origem', exact: true }).click();
    await expect(page.getByText('Carregador', { exact: true })).toBeVisible();
    expect(pageErrors).toEqual([]);
    await page.goto('/trips/checklists');
    await expect(page.getByTestId('checklists-title')).toBeVisible({ timeout: 15000 });
    await page.reload();
    await expect(page.getByTestId('checklists-title')).toBeVisible({ timeout: 15000 });
    await page.goto('/trips/list');
    await expect(page.getByTestId('trip-selector')).toBeVisible({ timeout: 15000 });
    await page.goto('/launchpad');
    await expect(page.getByTestId('launchpad-item-trips')).toBeVisible({ timeout: 15000 });
    expect(pageErrors).toEqual([]);
  });

  for (const width of [320, 375, 430]) {
    test(`deve caber em ${width}px e adicionar itens consecutivos com Enter`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      checklistsData[0].title = 'Documentos e preparativos para uma viagem em família';
      checklistsData[0].items[0].task = 'DocumentoDeViagemSemEspaços'.repeat(8);
      await goToChecklists(page);
      const assertFits = async () => {
        const overflow = await page.locator('.trip-checklists').evaluate(root => {
          const viewport = document.documentElement.clientWidth;
          const elements = [root, ...root.querySelectorAll('.checklist-card, .checklist-item-row')];
          return elements.some(element => element.scrollWidth > element.clientWidth + 1 || element.getBoundingClientRect().right > viewport + 1);
        });
        expect(overflow).toBe(false);
      };
      await expect(page.getByTestId('checklist-item-task-task-alpha')).toBeVisible();
      await assertFits();
      await expect.poll(() => page.locator('.trip-checklists').evaluate(root => root.scrollHeight > root.clientHeight || document.scrollingElement.scrollHeight > document.scrollingElement.clientHeight)).toBe(true);
      expect(await page.locator('.trip-checklists').evaluate(root => {
        const scroller = root.scrollHeight > root.clientHeight ? root : document.scrollingElement;
        scroller.scrollTop = 100;
        return scroller.scrollTop;
      })).toBeGreaterThan(0);
      await page.getByRole('button', { name: 'Adicionar item', exact: true }).click();
      const input = page.getByRole('textbox', { name: 'O que precisa ser feito?' });
      await input.fill('Seguro de viagem');
      await input.press('Enter');
      await expect(page.getByText('Seguro de viagem', { exact: true })).toBeVisible();
      await expect(input).toHaveValue('');
      await expect(input).toBeFocused();
      await input.fill('Carregador do celular');
      await input.press('Enter');
      await expect(page.getByText('Carregador do celular', { exact: true })).toBeVisible();
      await expect(input).toHaveValue('');
      await expect(input).toBeFocused();
      await assertFits();
      await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
      await expect(input).toBeHidden();
      await page.getByTestId('checklist-item-task-task-alpha').click();
      await expect(page.getByTestId('edit-item-input-task-alpha')).toBeVisible();
      await assertFits();
      await page.screenshot({ path: test.info().outputPath('mobile-checklist.png') });
    });
  }
});
