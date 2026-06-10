import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import MultiSelect from './MultiSelect';

vi.mock('lucide-react', () => ({
  Search: (props) => <div data-testid="search-icon" {...props} />,
  X: (props) => <div data-testid="x-icon" {...props} />,
  Check: () => <div data-testid="check-icon" />,
  ChevronDown: () => <div data-testid="chevron-down-icon" />,
}));

const options = [
  { value: 's1', label: 'Rock Nacional' },
  { value: 's2', label: 'Rock Internacional' },
  { value: 's3', label: 'MPB' },
];

describe('MultiSelect Component', () => {
  it('renders placeholder when no items selected', () => {
    render(<MultiSelect options={options} selected={[]} onChange={() => {}} />);
    expect(screen.getByText('Selecionar...')).toBeDefined();
  });

  it('shows selected items as chips', () => {
    render(<MultiSelect options={options} selected={['s1', 's3']} onChange={() => {}} />);
    expect(screen.getByText('Rock Nacional')).toBeDefined();
    expect(screen.getByText('MPB')).toBeDefined();
    expect(screen.queryByText('Rock Internacional')).toBeNull();
  });

  it('opens dropdown on click', () => {
    render(<MultiSelect options={options} selected={[]} onChange={() => {}} />);
    fireEvent.click(screen.getByText('Selecionar...'));
    expect(screen.getByPlaceholderText('Buscar...')).toBeDefined();
    expect(screen.getByText('Rock Nacional')).toBeDefined();
    expect(screen.getByText('Rock Internacional')).toBeDefined();
    expect(screen.getByText('MPB')).toBeDefined();
  });

  it('calls onChange with selected value when option is clicked', () => {
    const onChange = vi.fn();
    render(<MultiSelect options={options} selected={[]} onChange={onChange} />);
    fireEvent.click(screen.getByText('Selecionar...'));
    fireEvent.click(screen.getByText('Rock Nacional'));
    expect(onChange).toHaveBeenCalledWith(['s1']);
  });

  it('calls onChange with deselected value when selected option is clicked in dropdown', () => {
    const onChange = vi.fn();
    render(<MultiSelect options={options} selected={['s1', 's2']} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('chevron-down-icon'));
    const [_, option] = screen.getAllByText('Rock Nacional');
    fireEvent.click(option);
    expect(onChange).toHaveBeenCalledWith(['s2']);
  });

  it('filters options by search term', () => {
    render(<MultiSelect options={options} selected={[]} onChange={() => {}} />);
    fireEvent.click(screen.getByText('Selecionar...'));
    const searchInput = screen.getByPlaceholderText('Buscar...');
    fireEvent.change(searchInput, { target: { value: 'MPB' } });
    expect(screen.getByText('MPB')).toBeDefined();
    expect(screen.queryByText('Rock Nacional')).toBeNull();
    expect(screen.queryByText('Rock Internacional')).toBeNull();
  });

  it('shows empty state when no options match search', () => {
    render(<MultiSelect options={options} selected={[]} onChange={() => {}} />);
    fireEvent.click(screen.getByText('Selecionar...'));
    const searchInput = screen.getByPlaceholderText('Buscar...');
    fireEvent.change(searchInput, { target: { value: 'ZZZ' } });
    expect(screen.getByText('Nenhum resultado')).toBeDefined();
  });

  it('removes item when chip X is clicked', () => {
    const onChange = vi.fn();
    render(<MultiSelect options={options} selected={['s1']} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('x-icon'));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
