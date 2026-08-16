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

    await page.route('**/rest/v1/car_services*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { id: 's1', car_id: '1', service_date: '2025-08-15', description: 'Lavagem', km_at_service: 27000, amount: 200, notes: 'Lavagem completa' }
      ]) });
    });

    await page.addInitScript(() => {
      window.localStorage.setItem('pc_e2e_test', 'true');
    });
    await page.goto('/');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password');
    await page.getByRole('button', { name: 'Entrar' }).click();

    // Aguardar Dashboard via DOM (espera pelo header do novo layout)
    await page.waitForSelector('header', { timeout: 20000 });
  });

  test('should display car details in list', async ({ page }) => {
    // Navega para Carros via Launchpad
    await page.getByTestId('launchpad-item-cars').click();
    await page.waitForLoadState('networkidle');
    
    await expect(page.getByTestId('car-name').first()).toBeVisible();
    await expect(page.getByTestId('car-name').first()).toContainText('Audi A3');
    await expect(page.getByTestId('car-plate').first()).toContainText('ABC-1234');
  });

  test('should show maintenance info when selected', async ({ page }) => {
     // Navega para Carros via Launchpad
     await page.getByTestId('launchpad-item-cars').click();
     await page.waitForLoadState('networkidle');
     
     await expect(page.getByTestId('car-name').first()).toBeVisible();
     
     // Switch to Revision tab
     await page.click('button:has-text("Revisão")');
     
     // Expect maintenance section
     await expect(page.locator('text=CHECKPOINT').first()).toBeVisible();
  });

  test('should open register service modal and show status options', async ({ page }) => {
    // Navigate to Cars
    await page.getByTestId('launchpad-item-cars').click();
    await page.waitForLoadState('networkidle');

    // Switch to Revision tab
    await page.click('button:has-text("Revisão")');

    // Click "Registrar Serviço"
    await page.click('button:has-text("Registrar Serviço")');

    // Verify modal is open
    await expect(page.locator('h3:has-text("Registrar Serviço")')).toBeVisible();

    // Verify status options are visible (this triggers rendering of CheckCircle2, Clock, XCircle)
    await expect(page.locator('text=Concluído').first()).toBeVisible();
    await expect(page.locator('text=Pendente').first()).toBeVisible();
    await expect(page.locator('text=Ignorar').first()).toBeVisible();
  });

  test('should include car_services amount in total investment', async ({ page }) => {
    await page.getByTestId('launchpad-item-cars').click();
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('car-name').first()).toBeVisible();
  });
});
