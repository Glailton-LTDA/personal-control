import { test, expect } from '@playwright/test';

/** Garante que o grupo Viagens esteja expandido e retorna o botão de Ajustes. */
async function openTripSettings(page) {
  // Navega para Viagens via Top Nav ou garante que estamos no módulo
  const tripModuleBtn = page.getByTestId('sidebar-group-trips');
  await tripModuleBtn.click();
  
  // Espera o sub-header e clica em Ajustes
  await expect(page.getByTestId('sub-header')).toBeVisible({ timeout: 10000 });
  const ajustesBtn = page.getByTestId('sidebar-sub-item-trips-settings');
  await ajustesBtn.click();
  
  // Wait for the view to mount and header to reflect the new state
  await expect(page.getByTestId('trips-settings-container')).toBeVisible({ timeout: 15000 });
  
  const header = page.getByTestId('header-title').first();
  await expect(header).toBeVisible({ timeout: 15000 });
  // O header-title agora diz "Viagens"
  await expect(header).toHaveText(/Viagens/i);
}

/** Desbloqueia o app com a senha mestre padrão para testes. */
async function unlockApp(page) {
  const unlockModal = page.getByText('Acesso Seguro');
  if (await unlockModal.isVisible()) {
    await page.getByTestId('master-password-input').fill('password123');
    await page.getByRole('button', { name: 'Desbloquear Dados' }).click();
    await expect(unlockModal).not.toBeVisible({ timeout: 10000 });
  }
}

test.describe('Configurações de Viagens', () => {
  test.beforeEach(async ({ page }) => {
    // Intercepta Auth
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

    // Intercepta Viagens
    await page.route('**/rest/v1/trips*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'trip-1',
              title: 'Viagem Teste',
              currencies: ['EUR'],
              daily_limits: { EUR: 100 },
              countries: ['França'],
              cities: ['Paris'],
              hotels: [
                { id: 'h1', name: 'Hotel de Ville', confirmation: 'ABC123', start_date: '2024-05-01' }
              ],
              transports: [
                { id: 't1', name: 'Voo Paris', transport_id: 'AF123', confirmation: 'CONF456' }
              ],
              tickets: [
                { id: 'p1', name: 'Louvre', address: 'Rue de Rivoli' }
              ],
              user_id: 'user-123'
            }
          ]),
        });
      } else {
        await route.fulfill({ status: 200, body: JSON.stringify({ success: true }) });
      }
    });

    await page.goto('/');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.getByRole('button', { name: 'Entrar' }).click();
    // Aguarda o app estar pronto (Launchpad)
    await page.waitForSelector('header', { timeout: 20000 });
    await expect(page.getByText('Olá,')).toBeVisible({ timeout: 15000 });
    await unlockApp(page);
  });

  test('deve editar uma viagem e ver os novos campos de transporte e passeios', async ({ page }) => {
    await openTripSettings(page);

    // Aguarda os cards carregarem
    await expect(page.getByTestId('edit-trip-btn').first()).toBeVisible({ timeout: 15000 });
    await page.getByTestId('edit-trip-btn').first().click();

    // Verifica campos de hospedagem
    await expect(page.getByText('Hospedagens', { exact: false }).first()).toBeVisible();
    await expect(page.getByPlaceholder('Ex: Hotel Hilton...')).toBeVisible();
    await expect(page.getByText('Check-in', { exact: false })).toBeVisible();

    // Verifica campos de transporte
    await expect(page.getByText('Transportes', { exact: false }).first()).toBeVisible();
    await expect(page.getByPlaceholder('Ex: Voo LATAM 1234...')).toBeVisible();
    await expect(page.getByText('Partida', { exact: false })).toBeVisible();

    // Verifica campos de ingressos/tickets
    await expect(page.getByText('INGRESSOS & TICKETS', { exact: false }).first()).toBeVisible();
    await page.getByText('INGRESSOS & TICKETS', { exact: false }).first().click();
    await expect(page.getByPlaceholder('Ex: Ingressos Louvre...')).toBeVisible();

    // Salva
    await page.getByRole('button', { name: 'Atualizar Viagem' }).click();

    // Verifica se voltou para a lista de viagens (pelo título do header ou container)
    await expect(page.getByTestId('header-title').first()).toContainText('Viagens');
  });

  test('deve criar uma nova viagem com sucesso', async ({ page }) => {
    await openTripSettings(page);

    // Clica em Nova Viagem
    await page.getByRole('button', { name: 'Nova Viagem' }).click();

    // Preenche informações básicas
    await page.getByPlaceholder('Ex: Férias no Peru').fill('Viagem para o Egito');

    // Seleciona moedas (CurrencySelector)
    await page.getByText('USD').click();

    // Salva
    await page.getByRole('button', { name: 'Criar Viagem' }).click();

    // Verifica se voltou para a lista
    await expect(page.getByTestId('header-title').first()).toContainText('Viagens');
  });
});
