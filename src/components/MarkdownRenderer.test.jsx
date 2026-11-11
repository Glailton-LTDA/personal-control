// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import MarkdownRenderer from './MarkdownRenderer';
describe('shared Markdown component', () => {
  it('renders read-only content and updates when the source changes', () => {
    const { rerender, container } = render(<MarkdownRenderer content="# Old" />);
    expect(screen.getByRole('heading', { name: 'Old' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('heading'));
    rerender(<MarkdownRenderer content="## New" className="test-report" fontSize={18} />);
    expect(screen.getByRole('heading', { name: 'New' })).toBeInTheDocument();
    expect(container.firstChild).toHaveClass('test-report');
    expect(container.firstChild.style.fontSize).toBe('18px');
  });
  it('retains checkbox behavior for notes but ignores clicks on other content', () => {
    const toggle = vi.fn();
    const { container } = render(<MarkdownRenderer content={'Text\n- [ ] Task'} onToggleCheckbox={toggle} />);
    fireEvent.click(screen.getByText('Text'));
    expect(toggle).not.toHaveBeenCalled();
    fireEvent.click(container.querySelector('.preview-checkbox-toggle'));
    expect(toggle).toHaveBeenCalledExactlyOnceWith(1);
  });
});
