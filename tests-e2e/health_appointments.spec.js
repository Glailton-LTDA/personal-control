import { test, expect } from '@playwright/test';
const OWNER = '11111111-1111-4111-8111-111111111111';
const ORIGINAL = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const FOLLOWUP = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
async function openAppointment(page, { language = 'pt', failComplete = false } = {}) {
  const user = { id: OWNER, email: 'appointments@example.com', user_metadata: {} };
  const original = { id: ORIGINAL, name: 'Consulta de acompanhamento', status: 'scheduled', professional: 'Profissional de teste', specialty: 'Cardiologia', starts_at: '2026-11-10T12:00:00Z', location: 'Clínica de teste', address: 'Rua de teste, 42, São Paulo', notes: 'Observação privada da consulta original', condition_id: null, reminder_minutes: [1440, 120], follow_up_of: null };
  const records = [original];
  const writes = [];
  await page.addInitScript((language) => {
    localStorage.setItem('i18nextLng', language);
    localStorage.setItem('personal-control-theme', 'light');
  }, language);
  await page.route('**/auth/v1/**', (route) => route.fulfill({ json: route.request().url().includes('/token')
    ? { access_token: 'fake-token', token_type: 'bearer', expires_in: 3600, refresh_token: 'fake-refresh', user } : user }));
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request(); const url = new URL(request.url());
    const table = url.pathname.split('/').at(-1);
    if (table === 'notification_settings') return route.fulfill({ json: { menu_order: ['launchpad', 'health', 'settings'], visible_modules: ['launchpad', 'health', 'settings'] } });
    if (table !== 'health_appointments') return route.fulfill({ json: table === 'push_subscriptions' ? null : [] });
    if (request.method() === 'PATCH') {
      const body = request.postDataJSON(); writes.push({ method: 'PATCH', body, url });
      if (failComplete && body.status === 'completed') return route.fulfill({ status: 500, json: { message: 'Test failure' } });
      Object.assign(records.find((r) => `eq.${r.id}` === url.searchParams.get('id')), body);
      return route.fulfill({ json: { id: original.id } });
    }
    if (request.method() === 'POST') {
      const body = request.postDataJSON(); writes.push({ method: 'POST', body, url });
      records.push({ ...body, id: FOLLOWUP });
      return route.fulfill({ json: { id: FOLLOWUP } });
    }
    if (url.searchParams.has('id')) return route.fulfill({ json: records.find((r) => `eq.${r.id}` === url.searchParams.get('id')) });
    const parent = url.searchParams.get('follow_up_of');
    return route.fulfill({ json: parent ? records.filter((r) => `eq.${r.follow_up_of}` === parent) : records });
  });
  await page.goto(`/health/appointments/${ORIGINAL}`);
  await page.locator('input[type=email]').fill(user.email);
  await page.locator('input[type=password]').fill('test-password');
  await page.getByTestId('login-btn').click();
  await expect(page.getByRole('heading', { name: original.name, exact: true })).toBeVisible();
  return { writes, original, records };
}
async function noOverflow(page) {
  expect(await page.evaluate(() => [...document.querySelectorAll('.health-guide, .health-guide *, .health-modal, .health-modal *')]
    .filter((el) => el.getClientRects().length && !['INPUT','SELECT','TEXTAREA','svg','path'].includes(el.tagName)
      && getComputedStyle(el).display !== 'inline' && el.scrollWidth > el.clientWidth + 2)
    .map((el) => ({ tag: el.tagName, class: el.className })))).toEqual([]);
}
test('completes an appointment directly without rewriting its details', async ({ page }) => {
  const { writes, original } = await openAppointment(page);
  await page.getByRole('button', { name: 'Concluir consulta', exact: true }).click();
  await expect(page.locator('.health-status')).toHaveText('Concluída');
  expect(original.notes).toBe('Observação privada da consulta original');
  expect(writes[0].body).toEqual({ status: 'completed' });
  expect(writes[0].url.searchParams.get('user_id')).toBe(`eq.${OWNER}`);
  await expect(page.getByRole('button', { name: 'Concluir consulta', exact: true })).toHaveCount(0);
});
test('a failed completion preserves the scheduled state and can be retried', async ({ page }) => {
  await openAppointment(page, { failComplete: true });
  await page.getByRole('button', { name: 'Concluir consulta', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Concluir consulta', exact: true })).toBeEnabled();
  await expect(page.locator('.health-status')).toHaveText('Agendada');
});
test('schedules a linked return with a new date and shows it in the original history', async ({ page }) => {
  const { writes, original } = await openAppointment(page);
  await page.getByRole('button', { name: 'Agendar retorno', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Profissional', { exact: true })).toHaveValue(original.professional);
  await expect(dialog.getByLabel('Especialidade', { exact: true })).toHaveValue('Cardiologia');
  await expect(dialog.getByLabel('Endereço', { exact: true })).toHaveValue(original.address);
  await expect(dialog.getByLabel('Data e hora da consulta', { exact: true })).toHaveValue('');
  await expect(dialog.getByLabel('Observações', { exact: true })).toHaveValue('');
  await dialog.getByLabel('Data e hora da consulta', { exact: true }).fill('2026-12-15T10:00');
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Consulta original', exact: true })).toBeVisible();
  const created = writes.find((w) => w.method === 'POST').body;
  expect(created).toMatchObject({ follow_up_of: ORIGINAL, user_id: OWNER, status: 'scheduled', reminder_minutes: [1440,120] });
  expect(original.starts_at).toBe('2026-11-10T12:00:00Z');
  await page.getByRole('button', { name: /Consulta de acompanhamento/ }).click();
  await page.getByRole('button', { name: 'Histórico', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Retornos', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Consulta de acompanhamento/ })).toBeVisible();
});
test('suggests localized specialties while accepting a custom specialty and a manual address', async ({ page }) => {
  await page.route('https://nominatim.openstreetmap.org/**', (route) => route.abort());
  const { writes } = await openAppointment(page);
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  const dialog = page.getByRole('dialog'); const specialty = dialog.getByLabel('Especialidade', { exact: true });
  const listId = await specialty.getAttribute('list');
  await expect(page.locator(`[id="${listId}"] option[value="Cardiologia"]`)).toHaveCount(1);
  await specialty.fill('Especialidade personalizada');
  await dialog.getByLabel('Endereço', { exact: true }).fill('Endereço manual, 123 & sala 2');
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Abrir no GPS', exact: true })).toHaveAttribute('href', 'https://www.google.com/maps/search/?api=1&query=Endere%C3%A7o%20manual%2C%20123%20%26%20sala%202');
  expect(writes[0].body.specialty).toBe('Especialidade personalizada');
});
for (const width of [320,768,1440]) {
  test(`address lookup, appointment actions and follow-up form fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.route('https://nominatim.openstreetmap.org/**', (route) => {
      const url = new URL(route.request().url());
      expect(url.searchParams.get('q')).toBe('Rua teste');
      expect(url.searchParams.get('accept-language')).toBe('pt');
      return route.fulfill({ json: [{ display_name: 'Rua selecionada, Bairro, Cidade de teste', lon: '-46.6', lat: '-23.5' }] });
    });
    const { writes } = await openAppointment(page);
    await noOverflow(page);
    await page.getByRole('button', { name: 'Agendar retorno', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Endereço', { exact: true }).fill('Rua teste');
    await expect(page.getByRole('option', { name: 'Rua selecionada, Bairro, Cidade de teste' })).toBeVisible();
    await page.getByRole('option', { name: 'Rua selecionada, Bairro, Cidade de teste' }).click();
    await dialog.getByLabel('Nº / Complemento (Ex: 1234, Apt 5B)', { exact: true }).fill('12, sala 3');
    await noOverflow(page);
    await dialog.getByLabel('Data e hora da consulta', { exact: true }).fill('2026-12-15T10:00');
    await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/health/appointments/${FOLLOWUP}$`));
    const link = page.getByRole('link', { name: 'Abrir no GPS', exact: true });
    await expect(link).toBeVisible();
    const address = '12, sala 3, Rua selecionada, Bairro, Cidade de teste';
    expect(writes.find((write) => write.method === 'POST').body.address).toBe(address);
    await expect(link).toHaveAttribute('href', `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`);
    await noOverflow(page);
  });
}
for (const [language, complete, follow, address, specialty] of [
  ['en', 'Complete appointment', 'Schedule follow-up', 'Address', 'Cardiology'],
  ['es', 'Completar consulta', 'Programar seguimiento', 'Dirección', 'Cardiología'],
]) {
  test(`appointment improvements translate to ${language}`, async ({ page }) => {
    await openAppointment(page, { language });
    await expect(page.getByRole('button', { name: complete, exact: true })).toBeVisible();
    await page.getByRole('button', { name: follow, exact: true }).click();
    await expect(page.getByRole('dialog').getByLabel(address, { exact: true })).toBeVisible();
    await expect(page.locator(`datalist option[value="${specialty}"]`)).toHaveCount(1);
  });
}
