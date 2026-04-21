import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Investments from './Investments';

// Mock sub-components to focus on container logic
vi.mock('./InvestmentDashboard', () => ({
  default: () => <div data-testid="investment-dashboard">Dashboard Mock</div>
}));
vi.mock('./InvestmentList', () => ({
  default: () => <div data-testid="investment-list">List Mock</div>
}));
vi.mock('./InvestmentSettings', () => ({
  default: () => <div data-testid="investment-settings">Settings Mock</div>
}));

describe('Investments', () => {
  it('renders the dashboard by default when mode is dashboard', () => {
    render(<Investments mode="dashboard" />);
    expect(screen.getByTestId('investment-dashboard')).toBeInTheDocument();
  });

  it('renders the list when mode is list', () => {
    render(<Investments mode="list" />);
    expect(screen.getByTestId('investment-list')).toBeInTheDocument();
  });

  it('renders settings when mode is settings', () => {
    render(<Investments mode="settings" />);
    expect(screen.getByTestId('investment-settings')).toBeInTheDocument();
  });
});
