import { test, expect } from '@playwright/test';
import { Buffer } from 'node:buffer';

const OWNER = '11111111-1111-4111-8111-111111111111';
const EXAM = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4';

async function mockHealth(page, { language = 'pt', fail = false } = {}) {
  const requests = [];
  const user = {
    id: OWNER,
    email: 'health-test@example.com',
    user_metadata: { name: 'Test' },
  };
  let exams = [
    {
      id: EXAM,
      name: 'Hemograma completo',
      status: 'completed',
      performed_at: '2026-08-15T10:30:00Z',
      professional: 'Dra. Ana',
      laboratory: 'Laboratório Central',
      report: 'Laudo de exemplo para teste',
      notes: '',
      preparation: '',
      reminder_minutes: [1440, 120],
    },
  ];
  await page.addInitScript(
    ({ language }) => {
      localStorage.setItem('i18nextLng', language);
      localStorage.setItem('personal-control-theme', 'light');
    },
    { language },
  );
  await page.route('**/auth/v1/**', async (route) => {
    if (route.request().url().includes('/token'))
      return route.fulfill({
        json: {
          access_token: 'fake-token',
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'fake-refresh',
          user,
        },
      });
    return route.fulfill({ json: user });
  });
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const table = url.pathname.split('/').at(-1);
    if (!table.startsWith('health_'))
      return route.fulfill({
        json:
          table === 'notification_settings'
            ? {
                menu_order: ['launchpad', 'health', 'settings'],
                visible_modules: ['launchpad', 'health', 'settings'],
              }
            : [],
      });
    requests.push({
      url,
      method: route.request().method(),
      body: route.request().postDataJSON(),
    });
    if (fail)
      return route.fulfill({ status: 500, json: { message: 'test failure' } });
    const single = route
      .request()
      .headers()
      .accept?.includes('vnd.pgrst.object');
    if (route.request().method() === 'POST' && table === 'health_exams') {
      const body = route.request().postDataJSON();
      const created = { ...body, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' };
      exams = [...exams, created];
      return route.fulfill({ json: { id: created.id } });
    }
    if (route.request().method() === 'PATCH' && table === 'health_exams') {
      const id = url.searchParams.get('id')?.slice(3);
      const body = route.request().postDataJSON();
      exams = exams.map((exam) =>
        exam.id === id ? { ...exam, ...body } : exam,
      );
      return route.fulfill({ json: { id } });
    }
    let rows = table === 'health_exams' ? exams : [];
    const id = url.searchParams.get('id')?.slice(3);
    if (id) rows = rows.filter((row) => row.id === id);
    if (url.searchParams.has('name')) {
      const name = url.searchParams.get('name');
      rows = rows.filter((row) =>
        name.startsWith('eq.')
          ? row.name === name.slice(3)
          : row.name.toLowerCase().includes(name.slice(7, -1).toLowerCase()),
      );
    }
    return route.fulfill({ json: single ? rows[0] || null : rows });
  });
  await page.goto('/health/exams');
  await page.locator('input[type=email]').fill(user.email);
  await page.locator('input[type=password]').fill('test-password');
  await page.getByTestId('login-btn').click();
  await expect(page.getByTestId('health-guide')).toBeVisible();
  return requests;
}

async function noHorizontalOverflow(page) {
  const bad = await page.evaluate(() =>
    [
      ...document.querySelectorAll(
        '.health-guide, .health-guide *, .health-modal, .health-modal *',
      ),
    ]
      .filter((element) => {
        const style = getComputedStyle(element);
        return (
          element.getClientRects().length &&
          !['INPUT', 'SELECT', 'TEXTAREA', 'SVG', 'PATH'].includes(
            element.tagName,
          ) &&
          style.display !== 'inline' &&
          element.scrollWidth > element.clientWidth + 2
        );
      })
      .map((element) => ({
        tag: element.tagName,
        class: element.className,
        scroll: element.scrollWidth,
        width: element.clientWidth,
      })),
  );
  expect(bad).toEqual([]);
}

for (const width of [320, 390, 768, 1024, 1440]) {
  test(`exams, detail, report and form fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const requests = await mockHealth(page);
    await expect(
      page.getByRole('button', { name: /Hemograma completo/ }),
    ).toBeVisible();
    await noHorizontalOverflow(page);
    await page.getByRole('button', { name: /Hemograma completo/ }).click();
    await page.getByRole('button', { name: 'Laudo', exact: true }).click();
    await expect(page.getByText('Laudo de exemplo para teste')).toBeVisible();
    await noHorizontalOverflow(page);
    await page.getByRole('button', { name: 'Histórico', exact: true }).click();
    await expect(
      page.getByRole('button', { name: /Hemograma completo/ }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Editar', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await noHorizontalOverflow(page);
    await page
      .getByRole('dialog')
      .getByLabel('Observações', { exact: true })
      .fill('Atualizado no teste');
    await page.getByRole('button', { name: 'Salvar', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    const patch = requests.find((request) => request.method === 'PATCH');
    expect(patch.body.notes).toBe('Atualizado no teste');
    expect(patch.url.searchParams.get('user_id')).toBe(`eq.${OWNER}`);
    for (const request of requests.filter(
      (request) => request.method === 'GET',
    )) {
      expect(request.url.searchParams.get('select')).not.toContain('*');
      expect(request.url.searchParams.get('user_id')).toBe(`eq.${OWNER}`);
      if (!request.url.searchParams.has('id'))
        expect(
          Number(request.url.searchParams.get('limit')),
        ).toBeLessThanOrEqual(21);
    }
    if (width === 1440 || width === 390)
      await page.screenshot({
        path: `/tmp/health-guide-${width}.png`,
        fullPage: true,
      });
  });
}

test('creates an exam and loads its own detail', async ({ page }) => {
  const requests = await mockHealth(page);
  await page.getByRole('button', { name: 'Novo exame', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByLabel('Nome', { exact: true })
    .fill('Ultrassom de teste');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Ultrassom de teste' }),
  ).toBeVisible();
  expect(
    requests.find((request) => request.method === 'POST').body.user_id,
  ).toBe(OWNER);
});

for (const [language, title, action, field] of [
  ['en', 'Medical guide', 'New exam', 'Name'],
  ['es', 'Guía médica', 'Nuevo examen', 'Nombre'],
]) {
  test(`medical guide translates to ${language}`, async ({ page }) => {
    await mockHealth(page, { language });
    await expect(
      page.getByRole('heading', { name: title, exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: action, exact: true }).click();
    await expect(
      page.getByRole('dialog').getByLabel(field, { exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId('health-guide')).not.toContainText('health.');
  });
}

test('shows a retryable error instead of an empty history when loading fails', async ({
  page,
}) => {
  await mockHealth(page, { fail: true });
  await expect(page.getByRole('alert')).toContainText(
    'Não foi possível concluir',
  );
  await expect(
    page.getByRole('button', { name: 'Tentar novamente' }),
  ).toBeVisible();
});

test('uploads, previews and deletes a private document', async ({ page }) => {
  await mockHealth(page);
  let doc;
  const storageRequests = [];
  await page.route('**/rest/v1/health_documents*', async (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      doc = { ...request.postDataJSON(), created_at: '2026-11-07T10:00:00Z' };
      return route.fulfill({ json: null, status: 201 });
    }
    if (request.method() === 'DELETE') {
      const id = doc.id;
      doc = null;
      return route.fulfill({ json: { id } });
    }
    return route.fulfill({
      json: request.headers().accept?.includes('vnd.pgrst.object')
        ? doc
        : doc
          ? [doc]
          : [],
    });
  });
  await page.route('**/storage/v1/**', async (route) => {
    storageRequests.push(route.request());
    if (route.request().method() === 'GET')
      return route.fulfill({
        body: '%PDF-1.4\n%%EOF',
        contentType: 'application/pdf',
      });
    return route.fulfill({ json: {} });
  });
  await page
    .locator('.health-module-tabs')
    .getByRole('link', { name: 'Documentos', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Anexar documento', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .locator('input[type=file]')
    .setInputFiles({
      name: 'Receita.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n%%EOF'),
    });
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Anexar documento', exact: true })
    .click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByText('Receita.pdf', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Visualizar: Receita.pdf' }).click();
  await expect(page.getByRole('dialog', { name: 'Receita.pdf' })).toBeVisible();
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByRole('button', { name: 'Excluir: Receita.pdf' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Excluir', exact: true })
    .click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(
    page.getByTestId('health-guide').getByText('Receita.pdf', { exact: true }),
  ).not.toBeVisible();
  for (const request of storageRequests) {
    expect(request.url()).toContain('/health-documents');
    expect(request.url()).not.toMatch(/\/public\/|\/sign\//);
    expect(request.headers().authorization).toBe('Bearer fake-token');
  }
});

test('adds a laboratory result to an exam', async ({ page }) => {
  await mockHealth(page);
  let result;
  await page.route('**/rest/v1/health_results*', async (route) => {
    if (route.request().method() === 'POST') {
      result = { ...route.request().postDataJSON(), id: 'result' };
      return route.fulfill({ json: { id: result.id } });
    }
    return route.fulfill({ json: result ? [result] : [] });
  });
  await page.getByRole('button', { name: /Hemograma completo/ }).click();
  await page.getByRole('button', { name: 'Resultados', exact: true }).click();
  await page
    .getByRole('button', { name: 'Adicionar resultado', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByLabel('Nome', { exact: true })
    .fill('Indicador de teste');
  await page
    .getByRole('dialog')
    .getByLabel('Valor ou resultado', { exact: true })
    .fill('10');
  await page
    .getByRole('dialog')
    .getByLabel('Unidade', { exact: true })
    .fill('unidade');
  await page
    .getByRole('dialog')
    .getByLabel('Referência do laboratório', { exact: true })
    .fill('Referência de teste');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Indicador de teste' }),
  ).toBeVisible();
  expect(result.exam_id).toBe(EXAM);
  expect(result.user_id).toBe(OWNER);
});

test('all mobile sections and creation forms fit without horizontal scrolling', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await mockHealth(page);
  const nav = page.locator('.health-module-tabs');
  for (const [name, action] of [
    ['Medicamentos', 'Novo tratamento'],
    ['Consultas', 'Nova consulta'],
    ['Condições de saúde', 'Nova condição'],
    ['Documentos', 'Anexar documento'],
  ]) {
    await nav.getByRole('link', { name, exact: true }).click();
    await noHorizontalOverflow(page);
    await page.getByRole('button', { name: action, exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await noHorizontalOverflow(page);
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  }
  await nav.getByRole('link', { name: 'Hoje', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Doses e lembretes de hoje' }),
  ).toBeVisible();
  await noHorizontalOverflow(page);
  await page
    .getByRole('button', { name: 'Registrar uso eventual', exact: true })
    .click();
  await noHorizontalOverflow(page);
});
