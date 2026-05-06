import { test, expect } from '@playwright/test';

test.describe('Custom Lists', () => {
  async function loginAndGoToLists(page) {
    await page.goto('/');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password');
    await page.click('button:has-text("Entrar")');
    
    // Wait for dashboard to load
    await expect(page.getByTestId('header-title').first()).toContainText('Finanças', { timeout: 15000 });

    // Expand "Minhas Listas" using test ID
    await page.getByTestId('sidebar-group-lists').click();
    
    // Wait for sub-item to be visible and click on "Gerenciar Listas"
    await expect(page.getByTestId('sidebar-sub-item-lists-manager')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('sidebar-sub-item-lists-manager').click();
  }

  test.beforeEach(async ({ page }) => {
    // Intercept login
    await page.route('**/auth/v1/token*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ 
          access_token: 'fake-token', 
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'mock-refresh',
          user: { id: 'user-123', email: 'test@example.com' } 
        }),
      });
    });

    await page.addInitScript(() => {
      window.localStorage.setItem('pc_e2e_test', 'true');
    });
  });

  test('should create a new list collection', async ({ page }) => {
    let createdLists = [];
    // Mock custom lists stateful
    await page.route('**/rest/v1/custom_lists*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(createdLists),
        });
      } else if (route.request().method() === 'POST') {
        const newList = { id: 'list-123', name: 'Lista E2E Teste', user_id: 'user-123', fields: [] };
        createdLists.push(newList);
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(newList),
        });
      }
    });

    await loginAndGoToLists(page);

    // Create new list
    await page.getByTestId('btn-add-collection').click();
    
    await page.fill('input[placeholder="Ex: Inventário de Remédios"]', 'Lista E2E Teste');
    await page.click('button:has-text("Criar Lista")');
    
    // Verify list created in sidebar
    const aside = page.locator('aside.glass-card').filter({ hasText: 'Coleções' });
    await expect(aside).toContainText('Lista E2E Teste', { timeout: 10000 });
  });

  test('should allow opening sharing modal', async ({ page }) => {
    // Mock a list already existing
    await page.route('**/rest/v1/custom_lists*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 'list-123', name: 'Lista E2E Teste', user_id: 'user-123', fields: [] }]),
      });
    });

    await loginAndGoToLists(page);

    await page.waitForSelector('aside.glass-card', { timeout: 10000 });
    const aside = page.locator('aside.glass-card').filter({ hasText: 'Coleções' });
    await expect(aside).toContainText('Lista E2E Teste', { timeout: 10000 });
    
    // Click share button using test ID
    const shareBtn = page.getByTestId('btn-share-collection').first();
    await shareBtn.click({ force: true });
    
    await expect(page.getByTestId('modal-title')).toContainText('Compartilhar Lista');
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });
});
