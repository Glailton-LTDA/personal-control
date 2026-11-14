import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HealthLinkSelect } from './HealthUI';

const state = vi.hoisted(() => ({ rows: [], detail: null }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, options) =>
      options?.name === undefined ? key : `${options.name} — ${options.date}`,
    i18n: { language: 'en' },
  }),
}));

vi.mock('../../hooks/useHealth', () => ({
  useHealthSearch: (value) => value,
  useHealthList: () => ({
    data: { rows: state.rows, hasNext: false },
    isError: false,
  }),
  useHealthDetail: () => ({ data: state.detail }),
}));

const wrapper = ({ children }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

function renderLink(kind, value = '') {
  const onChange = vi.fn();
  render(
    <HealthLinkSelect
      userId="owner"
      kind={kind}
      field="appointment_id"
      value={value}
      onChange={onChange}
    />,
    { wrapper },
  );
  return onChange;
}

beforeEach(() => {
  state.rows = [];
  state.detail = null;
});

describe('HealthLinkSelect option labels', () => {
  it('shows the appointment date next to the name', () => {
    state.rows = [
      { id: 'a1', name: 'Endocrinologista', starts_at: '2026-11-14T13:30:00Z' },
    ];
    renderLink('appointments');
    const select = screen.getByRole('combobox', { name: 'health.appointment_id' });
    expect([...select.options].map((option) => option.text)).toEqual([
      'health.none',
      'Endocrinologista — 11/14/2026',
    ]);
  });

  it('keeps date-only appointments on the same calendar day', () => {
    state.rows = [{ id: 'a2', name: 'Retorno', starts_at: '2026-03-02' }];
    renderLink('appointments');
    expect(screen.getByRole('option', { name: 'Retorno — 03/02/2026' })).toBeVisible();
  });

  it('falls back to the name when the appointment has no valid date', () => {
    state.rows = [
      { id: 'a3', name: 'Sem data', starts_at: '' },
      { id: 'a4', name: 'Data inválida', starts_at: 'not-a-date' },
    ];
    renderLink('appointments');
    expect(screen.getByRole('option', { name: 'Sem data' })).toBeVisible();
    expect(screen.getByRole('option', { name: 'Data inválida' })).toBeVisible();
  });

  it('does not add dates to other linked record kinds', () => {
    state.rows = [{ id: 'c1', name: 'Hipertensão', starts_at: '2026-11-14' }];
    renderLink('conditions');
    expect(screen.getByRole('option', { name: 'Hipertensão' })).toBeVisible();
  });

  it('keeps the selected appointment visible even when it is not in the current page', () => {
    state.detail = {
      id: 'old',
      name: 'Consulta antiga',
      starts_at: '2025-01-20T09:00:00Z',
    };
    state.rows = [{ id: 'a1', name: 'Endocrinologista', starts_at: '2026-11-14' }];
    renderLink('appointments', 'old');
    const select = screen.getByRole('combobox', { name: 'health.appointment_id' });
    expect(select).toHaveValue('old');
    expect(
      screen.getByRole('option', { name: 'Consulta antiga — 01/20/2025' }),
    ).toBeVisible();
  });

  it('reports the selected link and clears it with the empty option', () => {
    state.rows = [{ id: 'a1', name: 'Endocrinologista', starts_at: '2026-11-14' }];
    const onChange = renderLink('appointments');
    const select = screen.getByRole('combobox', { name: 'health.appointment_id' });
    fireEvent.change(select, { target: { value: 'a1' } });
    expect(onChange).toHaveBeenLastCalledWith('a1');
    fireEvent.change(select, { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
