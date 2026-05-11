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
    await page.getByTestId('login-btn').click();

    // Wait for Dashboard to mount (Launchpad)
    await page.waitForSelector('header', { timeout: 20000 });
    await expect(page.getByTestId('welcome-message')).toBeVisible({ timeout: 15000 });
  });

  test('should display investment dashboard with charts', async ({ page }) => {
    // Navega para Investimentos via Launchpad
    await page.getByTestId('launchpad-item-investments').click();
    await page.waitForLoadState('networkidle');
    
    // Wait for the view to change
    await expect(page.getByText(/Performance de Investimentos|Investment Performance/i)).toBeVisible({ timeout: 15000 });
    
    // Wait for performance card
    await expect(page.getByText(/Performance de Investimentos|Investment Performance/i)).toBeVisible({ timeout: 10000 });
    
    // Check specific stats
    await expect(page.getByText(/Patrimônio Total|Total Assets/i)).toBeVisible();
  });

  test('should navigate to investment list', async ({ page }) => {
    // Navega para Investimentos via Launchpad
    await page.getByTestId('launchpad-item-investments').click();
    await page.waitForLoadState('networkidle');

    // Wait for the investments-dashboard to load
    // Clica em "Planilha" no sub-header
    await page.getByTestId('sidebar-sub-item-investments-list').click();

    // Confirm navigation succeeded via header title change
    await expect(page.getByTestId('header-title').first()).toHaveText(/Investimentos|Investments/i, { timeout: 10000 });
    // Now check the summary card
    await expect(page.getByTestId('summary-card-total-balance-list')).toBeVisible({ timeout: 30000 });
  });
});
