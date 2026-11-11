// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import HealthReportEditor from './HealthReportEditor';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }));
describe('medical report Markdown editor', () => {
  it('starts in edit mode, accepts text and previews the controlled draft without saving', () => {
    const change = vi.fn();
    const { rerender } = render(<HealthReportEditor value="Original" onChange={change} />);
    const input = screen.getByRole('textbox', { name: 'health.report' });
    expect(input).toHaveValue('Original');
    expect(input).toHaveAttribute('maxlength', '100000');
    fireEvent.change(input, { target: { value: '# Draft' } });
    expect(change).toHaveBeenCalledExactlyOnceWith('# Draft');
    rerender(<HealthReportEditor value="# Draft" onChange={change} />);
    fireEvent.click(screen.getByRole('button', { name: 'health.markdown_preview' }));
    expect(screen.getByRole('heading', { name: 'Draft' })).toBeInTheDocument();
    expect(change).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'health.markdown_edit' }));
    expect(screen.getByRole('textbox')).toHaveValue('# Draft');
  });
  it('shows the translated empty state in preview', () => {
    render(<HealthReportEditor value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'health.markdown_preview' }));
    expect(screen.getByText('health.no_information')).toBeInTheDocument();
  });
  it('disables text editing and mode changes while a record is being saved', () => {
    render(<HealthReportEditor value="Text" onChange={vi.fn()} disabled />);
    expect(screen.getByRole('textbox')).toBeDisabled();
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
  });
});
