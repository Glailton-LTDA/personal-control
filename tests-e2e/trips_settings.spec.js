import { test, expect } from '@playwright/test';

/** Garante que o grupo Viagens esteja expandido e retorna o botão de Ajustes. */
async function openTripSettings(page) {
  const ajustesBtn = page.getByRole('button', { name: 'Ajustes de Viagens' });

  if (!await ajustesBtn.isVisible()) {
    await page.getByText('Viagens', { exact: true }).click();
    await expect(ajustesBtn).toBeVisible({ timeout: 5000 });
  }

  await ajustesBtn.click();
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
    // Aguarda o app estar pronto antes de cada teste
    await expect(page.getByText('Personal')).toBeVisible({ timeout: 15000 });
  });

  test('deve editar uma viagem e ver os novos campos de transporte e passeios', async ({ page }) => {
    await openTripSettings(page);

    // Aguarda os cards carregarem
    await expect(page.getByRole('button', { name: 'Editar' }).first()).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: 'Editar' }).first().click();

    // Verifica campos de hospedagem
    await expect(page.getByText('Hospedagens (Hotéis/Airbnbs)')).toBeVisible();
    await expect(page.getByPlaceholder('Ex: Ibis Paris, Airbnb Marais...')).toBeVisible();
    await expect(page.getByText('Check-in')).toBeVisible();

    // Verifica campos de transporte
    await expect(page.getByText('Transportes (Voos/Trens/Aluguéis)')).toBeVisible();
    await expect(page.getByPlaceholder('Ex: LA8100, Placa ABC-1234...')).toBeVisible();
    await expect(page.getByText('Partida')).toBeVisible();

    // Verifica campos de passeios
    await expect(page.getByText('Passeios, Ingressos e Tickets')).toBeVisible();
    await page.getByText('Passeios, Ingressos e Tickets').click();
    await expect(page.getByPlaceholder(/Louvre Museum, Rue de Rivoli/)).toBeVisible();

    // Salva
    await page.getByRole('button', { name: 'Atualizar Viagem' }).click();

    // Verifica se voltou para a lista de viagens
    await expect(page.getByRole('heading', { name: 'Gerenciar Viagens' })).toBeVisible();
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
    await expect(page.getByRole('heading', { name: 'Gerenciar Viagens' })).toBeVisible();
  });
});
