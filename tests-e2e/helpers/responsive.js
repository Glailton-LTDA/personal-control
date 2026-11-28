import { expect } from '@playwright/test';
export const responsiveOwner = '11111111-1111-4111-8111-111111111111';
export const longName =
  'Reserva de emergência e planejamento familiar para o próximo ano';
const stamp = '2026-11-28T12:00:00Z';
export async function mockResponsiveApp(page, { theme = 'dark' } = {}) {
  const user = {
    id: responsiveOwner,
    email: 'responsive@example.test',
    user_metadata: { name: 'Pessoa de teste' },
  };
  const treatment = {
    id: 'medication',
    name: 'Medicamento de acompanhamento com apresentação e nome longos',
    dose: '1 comprimido',
    status: 'active',
    timezone: 'UTC',
    starts_on: '2026-11-01',
    row_version: 0,
    schedule_pending: false,
    reminders_enabled: false,
    schedule: {
      mode: 'interval',
      interval_minutes: 480,
      timezone: 'UTC',
      duration_kind: 'continuous',
      anchor_at: '2026-11-01T06:00:00Z',
    },
    today: {
      planned: 2,
      taken: 1,
      slots: [
        {
          scheduled_at: '2026-11-28T06:00:00Z',
          status: 'taken',
          record_version: 1,
          planned_amount: '1 comprimido',
        },
        {
          scheduled_at: '2026-11-28T14:00:00Z',
          status: 'scheduled',
          record_version: 0,
          planned_amount: '1 comprimido',
        },
      ],
    },
  };
  const table = {
    notification_settings: {
      menu_order: [
        'launchpad',
        'myday',
        'minhasfinancas',
        'health',
        'trips',
        'cars',
        'investments',
        'lists',
        'music',
        'settings',
      ],
      visible_modules: [
        'launchpad',
        'myday',
        'minhasfinancas',
        'health',
        'trips',
        'cars',
        'investments',
        'lists',
        'music',
        'settings',
      ],
    },
    mf_accounts: [
      {
        id: 'account',
        user_id: responsiveOwner,
        name: longName,
        account_type: 'CORRENTE',
        currency: 'BRL',
        initial_balance: 1500,
        sort_order: 0,
        is_active: true,
      },
    ],
    investment_institutions: [
      {
        id: 'institution',
        name: 'Instituição de investimentos para a reserva familiar',
        color: '#6366f1',
      },
    ],
    investment_account_types: [{ id: 'type', name: 'Renda fixa' }],
    investment_accounts: [
      {
        id: 'investment',
        user_id: responsiveOwner,
        name: longName,
        currency: 'BRL',
        institution_id: 'institution',
        account_type_id: 'type',
        institution: { name: 'Instituição de teste', color: '#6366f1' },
        type: { name: 'Renda fixa' },
      },
    ],
    markdown_notebooks: [
      {
        id: 'notebook',
        user_id: responsiveOwner,
        name: 'Anotações de planejamento pessoal',
        created_at: stamp,
      },
    ],
    mf_goals: [
      {
        id: 'goal',
        user_id: responsiveOwner,
        name: longName,
        target_amount: 10000,
        initial_amount: 2000,
        account_ids: [],
        account_id: null,
        status: 'ACTIVE',
        icon: '🎯',
        color: '#6366f1',
      },
    ],
    trips: [
      {
        id: 'trip',
        user_id: responsiveOwner,
        title: 'Viagem em família para conhecer Recife e o litoral',
        cities: ['Recife'],
        countries: ['Brasil'],
        start_date: '2026-11-28',
        end_date: '2026-12-03',
        currencies: ['BRL'],
        daily_limits: { BRL: 200 },
        participants: ['Pessoa de teste'],
        hotels: [],
        transports: [],
        receipts: [],
        tickets: [],
        misc_docs: [],
      },
    ],
    trip_itinerary: [
      {
        id: 'itinerary',
        trip_id: 'trip',
        user_id: responsiveOwner,
        day: '2026-11-28',
        time: '16:00',
        activity: 'Passeio pelo centro histórico com a família',
        location: 'Centro histórico',
        completed: false,
      },
    ],
    cars: [
      {
        id: 'car',
        user_id: responsiveOwner,
        name: 'Automóvel da família para viagens e deslocamentos',
        make: 'Marca',
        model: 'Modelo',
        year: 2025,
        plate: 'ABC1D23',
        current_km: 15000,
        created_at: stamp,
      },
    ],
    health_appointments: [
      {
        id: 'appointment',
        user_id: responsiveOwner,
        name: 'Consulta de acompanhamento com cardiologista',
        status: 'scheduled',
        starts_at: '2026-11-28T16:00:00Z',
        professional: 'Profissional de teste',
        specialty: 'Cardiologia',
        location: 'Clínica de teste',
        address: 'Rua de teste, 123',
        reminder_minutes: [120],
      },
    ],
    health_exams: [
      {
        id: 'exam',
        user_id: responsiveOwner,
        name: 'Exame de acompanhamento e avaliação clínica',
        status: 'scheduled',
        performed_at: '2026-11-28T10:00:00Z',
        laboratory: 'Laboratório de teste',
        report: '',
        notes: '',
        preparation: '',
        reminder_minutes: [120],
      },
    ],
  };
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript((theme) => {
    localStorage.setItem('i18nextLng', 'pt');
    localStorage.setItem('personal-control-theme', theme);
  }, theme);
  await page.route('**/auth/v1/**', (route) =>
    route.fulfill({
      json: route.request().url().includes('/token')
        ? {
            access_token: 'synthetic-token',
            token_type: 'bearer',
            expires_in: 3600,
            refresh_token: 'synthetic-refresh',
            user,
          }
        : user,
    })
  );
  await page.route('**/rest/v1/**', (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      name = url.pathname.split('/').at(-1),
      single = (req.headers().accept || '').includes('vnd.pgrst.object');
    if (name === 'my_day_summary')
      return route.fulfill({
        json: { day: '2026-11-28', generated_at: stamp, sections: {} },
      });
    if (name === 'mf_month_summary')
      return route.fulfill({ json: { rows: [], chartTxs: [] } });
    if (name === 'health_treatment_list')
      return route.fulfill({ json: { rows: [treatment], has_more: false } });
    if (name === 'health_treatment_detail')
      return route.fulfill({
        json: {
          medication: treatment,
          schedule: treatment.schedule,
          today: treatment.today.slots,
          next: [],
          stats: { taken_total: 1, due_recent: 2, taken_due: 1, overdue: 1 },
        },
      });
    if (name === 'health_treatment_calendar')
      return route.fulfill({ json: { days: [] } });
    if (name === 'health_treatment_dashboard')
      return route.fulfill({ json: { active_count: 0, today: {} } });
    if (name === 'health_refresh_reminders') return route.fulfill({ json: {} });
    let rows = table[name] || [];
    if (name === 'notification_settings')
      return route.fulfill({ json: table[name] });
    const id = url.searchParams.get('id');
    if (id?.startsWith('eq.'))
      rows = rows.filter((row) => row.id === id.slice(3));
    if (req.method() === 'POST')
      return route.fulfill({
        json: single
          ? { id: 'created', ...req.postDataJSON() }
          : [{ id: 'created', ...req.postDataJSON() }],
      });
    return route.fulfill({
      json: single ? rows[0] || null : rows,
      headers: {
        'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}`,
      },
    });
  });
  return table;
}
export async function loginResponsive(page) {
  await page.goto('/');
  await page.locator('input[type=email]').fill('responsive@example.test');
  await page.locator('input[type=password]').fill('synthetic-password');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByTestId('welcome-message').waitFor();
}
export async function layoutProblems(page) {
  return page.evaluate(() => {
    const viewport = innerWidth,
      main = document.querySelector('main');
    const labels = Array.from(
      main.querySelectorAll('button,input,select,textarea,h1,h2,h3,a[href]')
    ).filter(
      (el) =>
        el.getClientRects().length &&
        getComputedStyle(el).visibility !== 'hidden' &&
        !el.closest('[aria-hidden=true]')
    );
    const outside = labels
      .map((el) => ({ el, rect: el.getBoundingClientRect() }))
      .filter(
        ({ el, rect }) =>
          rect.width > 0 &&
          (rect.left < -1 || rect.right > viewport + 1) &&
          !el.closest('[role=listbox]')
      )
      .map(({ el, rect }) => ({
        tag: el.tagName,
        text: (
          el.innerText ||
          el.getAttribute('aria-label') ||
          el.getAttribute('placeholder') ||
          el.type
        ).slice(0, 90),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
      }));
    const overflow = Array.from(
      main.querySelectorAll('section,form,.glass-card,.modal-content')
    )
      .filter(
        (el) =>
          el.getClientRects().length &&
          el.clientWidth > 0 &&
          el.scrollWidth > el.clientWidth + 2
      )
      .map((el) => ({
        tag: el.tagName,
        class: el.className,
        width: el.clientWidth,
        scroll: el.scrollWidth,
      }));
    return {
      viewport,
      document: document.documentElement.scrollWidth,
      main: { width: main.clientWidth, scroll: main.scrollWidth },
      outside,
      overflow,
    };
  });
}

export async function assertResponsivePage(page, route) {
  await page.goto('/' + route, { waitUntil: 'domcontentloaded' });
  await page.locator('main').first().waitFor();
  await page.waitForLoadState('networkidle');
  await expect(
    page.locator('main').first().locator(':scope > div').first()
  ).toHaveCSS('opacity', '1');
  const result = await layoutProblems(page);
  expect(result.document, `Document overflow on ${route}`).toBeLessThanOrEqual(
    result.viewport + 2
  );
  expect(
    result.main.scroll,
    `Content overflow on ${route}`
  ).toBeLessThanOrEqual(result.main.width + 2);
  expect(result.outside, `Controls outside viewport on ${route}`).toEqual([]);
}
