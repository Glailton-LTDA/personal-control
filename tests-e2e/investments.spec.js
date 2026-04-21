import { test, expect } from '@playwright/test';

test.describe('Investments Module', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept login and initial data
    await page.route('**/auth/v1/token*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ 
          access_token: 'fake-token', 
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'mock-refresh',
          user: { id: '123', email: 'test@example.com' } 
        }),
      });
    });

    await page.route('**/rest/v1/investment_records*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 1, account_id: 1, yield: 100, final_balance: 1000, record_date: '2026-04-01', investment_accounts: { institution: 'Inter', name: 'CDB', color: '#10b981' } }
        ]),
      });
    });

     await page.route('**/rest/v1/investment_accounts*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 1, name: 'CDB', institution: 'Inter', color: '#10b981' }
        ]),
      });
    });

    await page.goto('/');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password');
    await page.click('button:has-text("Entrar")');
  });

  test('should display investment dashboard with charts', async ({ page }) => {
    // Navigate to Investments via Sidebar
    const investmentsGroup = page.locator('.sidebar-group').filter({ hasText: 'Investimentos' });
    await investmentsGroup.getByRole('button', { name: 'Dashboard' }).click();
    
    // Wait for the view to change
    await expect(page.locator('header h2')).toHaveText('Dashboard de Investimentos');
    
    // Wait for performance card
    await expect(page.locator('h3:has-text("Performance de Investimentos")')).toBeVisible({ timeout: 10000 });
    
    // Check specific stats
    await expect(page.locator('text=Patrimônio Total')).toBeVisible();
  });

  test('should navigate to investment list', async ({ page }) => {
    const investmentsGroup = page.locator('.sidebar-group').filter({ hasText: 'Investimentos' });
    await investmentsGroup.getByRole('button', { name: 'Planilha de Investimentos' }).click();
    
    await expect(page.locator('header h2')).toHaveText('Planilha de Investimentos');
    await expect(page.locator('text=Saldo Final Total')).toBeVisible({ timeout: 10000 });
  });
});
