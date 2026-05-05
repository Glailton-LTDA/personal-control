import { test, expect } from '@playwright/test';

test.describe('MyCars Module', () => {
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
          user: { id: '123', email: 'test@example.com' } 
        }),
      });
    });

    // Mock cars data
    await page.route('**/rest/v1/cars*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: '1', name: 'Audi A3', make: 'Audi', model: 'A3', year: 2022, plate: 'ABC-1234', current_km: 15000, created_at: new Date().toISOString() }
        ]),
      });
    });

    await page.route('**/rest/v1/car_shares*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    await page.route('**/rest/v1/car_maintenance*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    await page.addInitScript(() => {
      window.localStorage.setItem('pc_e2e_test', 'true');
    });
    await page.goto('/');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password');
    await page.click('button:has-text("Entrar")');
  });

  test('should display car details in list', async ({ page }) => {
    // Navigate to MyCars
    await page.getByRole('button', { name: 'Carros' }).click();
    
    // Wait for car card
    // Wait for car info
    await expect(page.locator('text=Audi A3').first()).toBeVisible();
    await expect(page.locator('text=ABC-1234').first()).toBeVisible();
  });

  test('should show maintenance info when selected', async ({ page }) => {
     await page.getByRole('button', { name: 'Carros' }).click();
     
     // Select the car via dropdown
     await page.selectOption('select.glass-input', { label: /Audi A3/i });
     
     // Switch to Revision tab
     await page.click('button:has-text("Revisão")');
     
     // Expect maintenance section (it's called "Manutenção e Revisões" inside CarRevisionTable usually)
     // Let's check for "Kilometragem" or similar table headers
     await expect(page.locator('text=KM').first()).toBeVisible();
  });
});
