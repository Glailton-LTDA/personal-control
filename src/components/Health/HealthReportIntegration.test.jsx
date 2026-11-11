// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import HealthForm from './HealthForm';
import HealthGuide from './HealthGuide';
const { save } = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key, i18n: { language: 'en' } }) }));
vi.mock('../../lib/health', async (original) => ({ ...(await original()), saveHealth: save }));
vi.mock('../../hooks/useHealth', () => ({
  useHealthDetail: () => ({ data: { id: 'exam', name: 'Synthetic exam', status: 'completed', performed_at: '2026-01-01', report: '# Synthetic report', reminder_minutes: [] } }),
  useHealthList: () => ({ data: { rows: [], hasNext: false }, isLoading: false }),
  useHealthReminderSync: () => ({}), useHealthSearch: (value) => value,
}));
const wrap = (children) => render(<QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>);
describe('medical report integration', () => {
  it('saves the original Markdown text instead of preview HTML', async () => {
    save.mockResolvedValueOnce({ id: 'exam' });
    const saved = vi.fn();
    wrap(<HealthForm userId="owner" kind="exams" onClose={vi.fn()} onSaved={saved} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'health.name' }), { target: { value: 'Synthetic' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'health.report' }), { target: { value: '## Draft\n\n**Original text**' } });
    fireEvent.click(screen.getByRole('button', { name: 'health.markdown_preview' }));
    expect(screen.getByRole('heading', { name: 'Draft' })).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'health.save' }));
    await waitFor(() => expect(saved).toHaveBeenCalledWith('exam'));
    expect(save.mock.calls[0][2].report).toBe('## Draft\n\n**Original text**');
    expect(save.mock.calls[0].slice(0,2)).toEqual(['owner','exams']);
  });
  it('renders an already saved report as Markdown without changing the record', () => {
    const before = save.mock.calls.length;
    wrap(<HealthGuide user={{ id: 'owner' }} screen="exams" detailId="exam" navigate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'health.report', exact: true }));
    expect(screen.getByRole('heading', { name: 'Synthetic report' })).toBeInTheDocument();
    expect(save.mock.calls.length).toBe(before);
  });
});
