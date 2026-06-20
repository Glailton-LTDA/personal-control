import { test, expect } from '@playwright/test';

test.describe('Custom Lists Sorting', () => {
  async function loginAndGoToLists(page) {
    await page.goto('/');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password');
    await page.getByTestId('login-btn').click();
    
    await expect(page.getByTestId('welcome-message')).toBeVisible({ timeout: 15000 });

    await page.getByTestId('launchpad-item-finances').click();
    await page.waitForLoadState('networkidle');
    
    await page.getByTestId('sidebar-group-lists').click();
    
    await expect(page.getByTestId('sidebar-sub-item-lists-manager')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('sidebar-sub-item-lists-manager').click();
  }

  test.beforeEach(async ({ page }) => {
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

  test('should render sorting selector and allow changing sort options', async ({ page }) => {
    // Mock a list existing
    await page.route('**/rest/v1/custom_lists*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ 
          id: 'list-123', 
          name: 'Lista E2E Ordenada', 
          user_id: 'user-123', 
          fields: [{ id: 'date-f', name: 'Prazo', type: 'date' }] 
        }]),
      });
    });

    // Mock items
    await page.route('**/rest/v1/custom_list_items*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'item-1', list_id: 'list-123', user_id: 'user-123', completed: false, content: '{"date-f":"2026-06-25"}', order_index: 0, created_at: '2026-06-20T00:00:00Z' },
          { id: 'item-2', list_id: 'list-123', user_id: 'user-123', completed: false, content: '{"date-f":"2026-06-21"}', order_index: 1, created_at: '2026-06-20T00:00:01Z' }
        ]),
      });
    });

    await loginAndGoToLists(page);

    await page.waitForSelector('aside.glass-card', { timeout: 10000 });
    const aside = page.locator('aside.glass-card').filter({ hasText: 'Coleções' });
    await expect(aside).toContainText('Lista E2E Ordenada', { timeout: 10000 });

    // Verify sort selector is visible
    const sortSelect = page.getByTestId('select-sort-by');
    await expect(sortSelect).toBeVisible();

    // Select date sorting option
    await sortSelect.selectOption('date');
    await expect(sortSelect).toHaveValue('date');

    // Select manual sorting option
    await sortSelect.selectOption('manual');
    await expect(sortSelect).toHaveValue('manual');
  });
});
