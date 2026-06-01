import { test, expect } from '@playwright/test';

test.describe('Music Module', () => {
  async function loginAndGoToMusic(page) {
    await page.goto('/');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password');
    await page.getByTestId('login-btn').click();
    
    // Wait for dashboard to load (Launchpad)
    await expect(page.getByTestId('welcome-message')).toBeVisible({ timeout: 15000 });

    // Navigate to Music via Launchpad
    await page.getByTestId('launchpad-item-music').click();
    await page.waitForLoadState('networkidle');
    
    // Check title in sub-header
    await expect(page.getByTestId('header-title').first()).toContainText(/Músicas|Music|Música/i, { timeout: 15000 });
  }

  test.beforeEach(async ({ page }) => {
    // Intercept login API
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

    // Mock other music module dependencies to prevent network idle timeout issues
    await page.route('**/rest/v1/music_unique_artists*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.route('**/rest/v1/music_genres*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.route('**/rest/v1/music_chords*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

    await page.addInitScript(() => {
      window.localStorage.setItem('pc_e2e_test', 'true');
    });
  });

  test('should open repertoire and display empty state', async ({ page }) => {
    // Mock empty repertoire
    await page.route('**/rest/v1/music_songs*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await loginAndGoToMusic(page);

    // Verify empty state is displayed
    await expect(page.getByRole('heading', { name: 'Seu repertório está vazio' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Cadastrar Primeira Música|Nova Música/i }).first()).toBeVisible();
  });

  test('should open add song modal when clicking button', async ({ page }) => {
    // Mock empty repertoire
    await page.route('**/rest/v1/music_songs*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await loginAndGoToMusic(page);

    // Click on "Nova Música"
    await page.getByRole('button', { name: /Nova Música/i }).first().click();

    // Verify modal elements are visible
    await expect(page.getByRole('heading', { name: 'Nova Música' })).toBeVisible();
    await expect(page.locator('label', { hasText: /Título da Música/i })).toBeVisible();
  });
});
