import { test, expect } from '@playwright/test';

test.describe('Autenticação - Senha', () => {
  test.beforeEach(async ({ page }) => {
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
  });

  test('deve exibir formulário de "Esqueci minha senha" e enviar o link', async ({ page }) => {
    // Intercepta a chamada de reset
    await page.route('**/auth/v1/recover*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
    });

    await page.goto('/');

    // Clica em "Esqueci minha senha"
    await expect(page.getByText('Esqueci minha senha')).toBeVisible();
    await page.getByText('Esqueci minha senha').click();

    // Deve mostrar o formulário de reset
    await expect(page.getByText('Redefinir senha')).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();

    // Preenche e submete
    await page.fill('input[type="email"]', 'test@example.com');
    await page.getByRole('button', { name: /Enviar link/i }).click();

    // Confirma mensagem de sucesso
    await expect(page.getByText('E-mail enviado!')).toBeVisible({ timeout: 5000 });
  });

  test('deve voltar para o login a partir do formulário de esqueci a senha', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Esqueci minha senha').click();
    await expect(page.getByText('Redefinir senha')).toBeVisible();

    await page.getByText('Voltar ao login').click();
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
  });

  test('deve exibir seção de Alterar Senha nas configurações', async ({ page }) => {
    await page.route('**/rest/v1/notification_settings*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ 
          recipient_email: '', 
          bcc_email: '', 
          skip_email_modal: false, 
          auto_send_on_paid: false, 
          menu_order: ['finances', 'investments', 'trips', 'cars', 'settings'] 
        }),
      });
    });

    await page.goto('/');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByText('Personal')).toBeVisible({ timeout: 15000 });

    // Navega para Configurações expandindo o grupo e clicando em "Geral"
    const configGroup = page.getByTestId('sidebar-group-settings');
    await configGroup.click();
    await page.getByRole('button', { name: 'Geral' }).click();

    // Verifica seção de alterar senha
    await expect(page.getByRole('heading', { name: 'Alterar Senha' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Senha atual', { exact: true })).toBeVisible();
    await expect(page.getByText('Nova senha', { exact: true })).toBeVisible();
    await expect(page.getByText('Confirmar nova senha', { exact: true })).toBeVisible();
  });

  test('deve exibir formulário de nova senha ao acessar pelo link de recuperação', async ({ page }) => {
    // Mock da sessão inicial para recuperação
    await page.addInitScript(() => {
      const token = JSON.stringify({
        access_token: 'mock-token',
        refresh_token: 'mock-refresh',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: 'user-123', email: 'test@example.com' }
      });
      window.localStorage.setItem('sb-xfcehxyhhmuscodilfha-auth-token', token);
    });

    // Simula o acesso via link de recuperação
    await page.goto('/#type=recovery');

    // Deve mostrar o formulário de "Nova senha" (ResetPasswordForm)
    await expect(page.getByRole('heading', { name: 'Nova senha' })).toBeVisible();
    await expect(page.getByText('Escolha uma senha segura para sua conta')).toBeVisible();

    // Verifica campos
    await expect(page.locator('input[placeholder="••••••••"]').first()).toBeVisible();
    await expect(page.locator('input[placeholder="••••••••"]').last()).toBeVisible();

    // Tenta resetar (mockando o update do Supabase)
    await page.route('**/auth/v1/user*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { email: 'test@example.com' } }) });
    });

    await page.fill('input[placeholder="••••••••"] >> nth=0', 'newpassword123');
    await page.fill('input[placeholder="••••••••"] >> nth=1', 'newpassword123');
    await page.getByRole('button', { name: 'Redefinir senha' }).click();

    // Deve mostrar sucesso
    await expect(page.getByText('Senha redefinida!')).toBeVisible();

    // Clica em ir para login
    await page.getByRole('button', { name: 'Ir para o login' }).click();

    // Deve estar na tela de login normal
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
  });
});
