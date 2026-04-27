import { test, expect } from '@playwright/test';

test.describe('Investments Module', () => {
  test.beforeEach(async ({ page }) => {
    // Mock Supabase auth token (login + refresh)
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

    // Mock auth user endpoint
    await page.route('**/auth/v1/user*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: '123', email: 'test@example.com' }),
      });
    });

    // Block Supabase Realtime WebSocket — fake-token causes auth failure
    // which triggers onAuthStateChange(SIGNED_OUT) → session cleared → Dashboard unmounts
    await page.route('**/realtime/**', async (route) => {
      await route.abort();
    });

    // Mock Dashboard boot requests
    await page.route('**/rest/v1/notification_settings*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    await page.route('**/rest/v1/car_shares*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    // Mock investment data
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

    // Catch-all for any unmocked Supabase REST calls (finances dashboard is default tab)
    await page.route('**/rest/v1/finances*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route('**/rest/v1/finance_responsibles*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route('**/rest/v1/finance_categories*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    // Must be set before goto so EncryptionContext bypass is active on app boot
    await page.addInitScript(() => {
      window.localStorage.setItem('pc_e2e_test', 'true');
    });

    await page.goto('/');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password');
    await page.click('button:has-text("Entrar")');

    // Wait for Dashboard to mount
    await expect(page.getByTestId('header-title')).toBeVisible({ timeout: 15000 });
  });

  test('should display investment dashboard with charts', async ({ page }) => {
    // Navigate to Investments via Sidebar
    const investmentsGroup = page.locator('.sidebar-group').filter({ hasText: 'Investimentos' });
    const dashBtn = investmentsGroup.getByRole('button', { name: 'Dashboard' });
    
    if (!await dashBtn.isVisible()) {
      await page.getByRole('button', { name: 'Investimentos', exact: true }).click();
    }
    
    await expect(dashBtn).toBeVisible();
    await dashBtn.click();
    
    // Wait for the view to change
    await expect(page.getByRole('heading', { name: 'Dashboard de Investimentos' })).toBeVisible({ timeout: 15000 });
    
    // Wait for performance card
    await expect(page.locator('h3:has-text("Performance de Investimentos")')).toBeVisible({ timeout: 10000 });
    
    // Check specific stats
    await expect(page.locator('text=Patrimônio Total')).toBeVisible();
  });

  test('should navigate to investment list', async ({ page }) => {
    // Expand the Investments sidebar group and navigate to dashboard first
    const groupHeader = page.getByTestId('sidebar-group-investments');
    await groupHeader.click();

    // Wait for the investments-dashboard to load
    await expect(page.getByTestId('header-title')).toHaveText('Dashboard de Investimentos', { timeout: 10000 });

    // Navigate to Planilha via direct DOM evaluation to bypass any animation-phase misclick
    await page.evaluate(() => {
      const buttons = document.querySelectorAll('button[title="Planilha de Investimentos"]');
      if (buttons.length > 0) buttons[0].click();
    });

    // Confirm navigation succeeded via header title change
    await expect(page.getByTestId('header-title')).toHaveText('Planilha de Investimentos', { timeout: 10000 });

    // Now check the summary card
    await expect(page.getByTestId('summary-card-total-balance')).toBeVisible({ timeout: 15000 });
  });
});
