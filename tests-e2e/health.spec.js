import { test, expect } from '@playwright/test';
import { Buffer } from 'node:buffer';

const OWNER = '11111111-1111-4111-8111-111111111111';
const EXAM = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4';

async function mockHealth(page, { language = 'pt', fail = false, report = 'Laudo de exemplo para teste', theme = 'light' } = {}) {
  const requests = [];
  const user = {
    id: OWNER,
    email: 'health-test@example.com',
    user_metadata: { name: 'Test' },
  };
  let treatment = null;
  let dose = null;
  const treatmentId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
  let treatmentStatus = 'active';
  let version = 0;
  let recordVersion = 0;
  let exams = [
    {
      id: EXAM,
      name: 'Hemograma completo',
      status: 'completed',
      performed_at: '2026-08-15T10:30:00Z',
      professional: 'Dra. Ana',
      laboratory: 'Laboratório Central',
      report,
      notes: '',
      preparation: '',
      reminder_minutes: [1440, 120],
    },
  ];
  await page.addInitScript(
    ({ language, theme }) => {
      localStorage.setItem('i18nextLng', language);
      localStorage.setItem('personal-control-theme', theme);
    },
    { language, theme },
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
    if (table === 'health_treatment_save') {
      treatment = route.request().postDataJSON().p_payload;
      version += 1;
      return route.fulfill({ json: { id: treatmentId, row_version: version } });
    }
    const schedule = treatment ? { mode: treatment.mode, timezone: treatment.timezone,
      duration_kind: treatment.duration_kind, duration_days: Number(treatment.duration_days),
      interval_minutes: Number(treatment.interval_minutes), anchor_at: '2026-11-12T06:00:00Z',
      last_slot: '2026-11-18T22:00:00Z', local_times: treatment.local_times } : null;
    const medication = treatment ? { ...treatment, id: treatmentId, status: treatmentStatus, row_version: version } : null;
    const slots = ['06:00', '14:00', '22:00'].map(time => ({ scheduled_at: `2026-11-12T${time}:00Z`,
      status: time === '14:00' && dose ? dose.status : time === '22:00' ? 'scheduled' : 'missed',
      taken_at: time === '14:00' ? dose?.taken_at : null, amount: treatment?.dose,
      record_version: recordVersion }));
    if (table === 'health_treatment_list') return route.fulfill({ json: { rows: medication ? [{ ...medication, schedule, today: { planned:3,taken:dose?.status==='taken'?1:0 }, total_predicted:21, taken_total:dose?.status==='taken'?1:0, next_at:'2026-11-12T22:00:00Z' }] : [], has_more:false } });
    if (table === 'health_treatment_dashboard') return route.fulfill({ json: { active_count:medication?1:0,continuous_count:0,today:{planned:medication?3:0,taken:0,overdue:2},next:medication?{name:medication.name,scheduled_at:'2026-11-12T22:00:00Z'}:null } });
    if (table === 'health_treatment_detail') return route.fulfill({ json: { medication,schedule,
      stats:{total_predicted:21,taken_total:dose?.status==='taken'?1:0,skipped_total:dose?.status==='skipped'?1:0,overdue:dose?1:2,due_recent:2,taken_due:dose?.status==='taken'?1:0},today:slots,next:[{scheduled_at:'2026-11-12T22:00:00Z'}] } });
    if (table === 'health_treatment_calendar') return route.fulfill({ json: { timezone:'UTC',days:[{date:'2026-11-12',slots}] } });
    if (table === 'health_treatment_history') return route.fulfill({ json: { rows:slots.slice(0,2).reverse(),has_more:false } });
    if (table === 'health_dose_record') {
      const body=route.request().postDataJSON();dose={status:body.p_status,taken_at:body.p_taken_at};recordVersion+=1;
      return route.fulfill({json:{dose_id:'dose',row_version:recordVersion}});
    }
    if (table === 'health_dose_undo') { dose=null;recordVersion+=1;return route.fulfill({json:{undone:true}}); }
    if (table === 'health_treatment_state') {
      const action=route.request().postDataJSON().p_action;
      treatmentStatus=action==='pause'?'paused':action==='resume'?'active':'finished';version+=1;
      return route.fulfill({json:{status:treatmentStatus,row_version:version}});
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

test('creates a medication treatment and saves via RPC', async ({ page }) => {
  const requests = await mockHealth(page);
  await page.getByRole('link', { name: 'Medicamentos', exact: true }).click();
  await page.getByRole('button', { name: 'Novo tratamento', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByLabel('Nome do tratamento', { exact: true })
    .fill('Tratamento de teste');
  await page
    .getByRole('dialog')
    .getByLabel('Quantidade', { exact: true })
    .fill('1');
  await page.getByRole('dialog').getByLabel('Unidade',{exact:true}).fill('comprimido');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  const save = requests.find(
    (request) =>
      request.method === 'POST' && request.url.pathname.includes('/rpc/health_treatment_save'),
  );
  expect(save).toBeDefined();
  expect(save.body.p_payload.name).toBe('Tratamento de teste');
  expect(save.body.p_payload.dose).toBe('1 comprimido');
  await expect(page.getByRole('heading', { name: 'Tratamento de teste', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/health\/(medications|treatments)\//);
  await page.getByRole('button', {name:'Voltar',exact:true}).click();
  await expect(page.getByRole('button', {name:'Tratamento de teste',exact:true})).toBeVisible();
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


const markdownReport = '## Resultado sintético\n\n| Indicador | Resultado | Referência | Situação |\n| :--- | ---: | --- | --- |\n| **Indicador A** | 12 unidades | Referência sintética longa | Normal |\n| Indicador B | 15 unidades | Outra referência | Conferir |';
for (const width of [320, 768, 1440]) {
  test(`Markdown report and preview fit ${width}px without autosaving`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const writes = await mockHealth(page, { report: markdownReport });
    await page.getByRole('button', { name: /Hemograma completo/ }).click();
    await page.getByRole('button', { name: 'Laudo', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Resultado sintético' })).toBeVisible();
    await expect(page.locator('.health-report-markdown tbody tr')).toHaveCount(2);
    await noHorizontalOverflow(page);
    await page.getByRole('button', { name: 'Editar', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const draft = markdownReport + '\n\n**Texto adicionado no teste**';
    await dialog.getByLabel('Laudo', { exact: true }).fill(draft);
    await dialog.getByRole('button', { name: 'Visualizar', exact: true }).click();
    await expect(dialog.getByRole('heading', { name: 'Resultado sintético' })).toBeVisible();
    await expect(dialog.getByText('Texto adicionado no teste', { exact: true })).toBeVisible();
    expect(writes.filter((request) => ['POST','PATCH'].includes(request.method))).toHaveLength(0);
    await noHorizontalOverflow(page);
    if (width === 320 || width === 1440) await page.screenshot({ path: `/tmp/medical-report-preview-${width}.png`, fullPage: true });
    await dialog.getByRole('button', { name: 'Editar Markdown', exact: true }).click();
    await expect(dialog.getByLabel('Laudo', { exact: true })).toHaveValue(draft);
    await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(writes.find((request) => request.method === 'PATCH').body.report).toBe(draft);
  });
}
for (const [language, edit, preview] of [['en', 'Edit Markdown', 'Preview'], ['es', 'Editar Markdown', 'Vista previa']]) {
  test(`Markdown editor is translated to ${language}`, async ({ page }) => {
    await mockHealth(page, { language, report: markdownReport });
    await page.getByRole('button', { name: /Hemograma completo/ }).click();
    await page.getByRole('button', { name: language === 'en' ? 'Edit' : 'Editar', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: edit, exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: preview, exact: true }).click();
    await expect(dialog.getByRole('heading', { name: 'Resultado sintético' })).toBeVisible();
  });
}
test('report HTML and dangerous links remain inert in the browser', async ({ page }) => {
  const remote = [];
  page.on('request', (request) => { if(request.url().includes('untrusted.example')) remote.push(request.url()); });
  await mockHealth(page, { report: '| Name | Result |\n| --- | --- |\n| <img src="https://untrusted.example/tracker" onerror="window.__unsafeReport=1"> | [bad](javascript:alert%281%29) |' });
  await page.getByRole('button', { name: /Hemograma completo/ }).click();
  await page.getByRole('button', { name: 'Laudo', exact: true }).click();
  await expect(page.locator('.health-report-markdown table')).toBeVisible();
  await expect(page.locator('.health-report-markdown img, .health-report-markdown script, .health-report-markdown a')).toHaveCount(0);
  expect(await page.evaluate(() => window.__unsafeReport)).toBeUndefined();
  expect(remote).toEqual([]);
});

for (const width of [320, 390, 768, 1024, 1440]) {
  test(`treatment schedule, doses and calendar fit ${width}px`, async ({page}) => {
    await page.setViewportSize({width,height:1000});
    await page.clock.setFixedTime(new Date('2026-11-12T17:20:00Z'));
    await mockHealth(page);
    await page.getByRole('link',{name:'Medicamentos',exact:true}).click();
    await page.getByRole('button',{name:'Novo tratamento',exact:true}).click();
    const form=page.getByRole('dialog');
    await form.getByLabel('Nome do tratamento',{exact:true}).fill('Medicamento de teste');
    await expect(form.getByLabel('Dose por tomada',{exact:true})).toHaveCount(0);
    await form.getByLabel('Quantidade',{exact:true}).fill('1');
    await form.getByLabel('Unidade',{exact:true}).fill('comprimido');
    for (const control of await form.locator('input[type=radio],input[type=checkbox]').all()) {
      await expect(control).toHaveCSS('width','20px');
      await expect(control).toHaveCSS('height','20px');
      await expect(control).toHaveCSS('padding','0px');
    }
    await form.getByLabel('Data do horário inicial',{exact:true}).fill('2026-11-12');
    await form.getByLabel('Horário inicial',{exact:true}).fill('06:00');
    await expect(form.getByText('21 doses previstas',{exact:true})).toBeVisible();
    await expect(form.getByRole('textbox',{name:/Fuso/})).toHaveCount(0);
    await form.getByRole('button',{name:'Salvar',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Medicamento de teste',exact:true})).toBeVisible();
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await page.getByRole('button',{name:'Registrar dose tomada',exact:true}).first().click();
    await page.getByRole('dialog').getByLabel('Horário da tomada',{exact:true}).fill('2026-11-12T17:20');
    await page.getByRole('dialog').getByRole('button',{name:'Salvar',exact:true}).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    page.once('dialog', dialog=>dialog.accept());
    await page.getByRole('button',{name:'Desfazer registro',exact:true}).click();
    await page.getByRole('button',{name:'Calendário',exact:true}).click();
    await expect(page.getByRole('button',{name:/12 de nov.*doses tomadas/})).toBeVisible();
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await page.getByRole('button',{name:'Histórico',exact:true}).click();
    await expect(page.getByRole('button',{name:'Próxima',exact:true})).toBeDisabled();
    await page.screenshot({path:`test-results/treatment-fixed-${width}.png`,fullPage:true});
  });
}

for (const [language, moduleName, action, nameLabel, doseLabel, saveLabel, totalLabel] of [
  ['en','Medications','New treatment','Treatment name','Quantity','Save','21 planned doses'],
  ['es','Medicamentos','Nuevo tratamiento','Nombre del tratamiento','Cantidad','Guardar','21 dosis previstas'],
]) {
  test(`treatment form and private detail are translated in ${language} dark theme`, async ({page}) => {
    await page.setViewportSize({width:390,height:950});
    await page.clock.setFixedTime(new Date('2026-11-12T09:00:00Z'));
    await mockHealth(page,{language,theme:'dark'});
    await page.getByRole('link',{name:moduleName,exact:true}).click();
    await page.getByRole('button',{name:action,exact:true}).click();
    const form=page.getByRole('dialog');
    await form.getByLabel(nameLabel,{exact:true}).fill('Synthetic treatment');
    await form.getByLabel(doseLabel,{exact:true}).fill('1');
    await form.getByLabel(language==='en'?'Unit':'Unidad',{exact:true}).fill('mL');
    await expect(form.getByText(totalLabel,{exact:true})).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
    await expect(page.locator('body')).not.toContainText('health.');
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await form.screenshot({path:`test-results/treatment-form-${language}-dark.png`});
    await form.getByRole('button',{name:saveLabel,exact:true}).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/health\/medications\/bbbb/);
    await expect(page.getByRole('heading',{name:'Synthetic treatment',exact:true})).toBeVisible();
  });
}
