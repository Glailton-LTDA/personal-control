import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import Dashboard from './Dashboard';

// Mock supabase
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
      signOut: vi.fn(() => Promise.resolve({ error: null })),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: vi.fn((cb) => cb({ data: [], count: 0, error: null })),
    })),
  }
}));

// Mock Framer Motion
vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: (target, prop) => {
      return ({ children, ...props }) => {
        const Tag = prop;
        const { animate, initial, exit, transition, whileHover, whileTap, layout, ...domProps } = props;
        return <Tag {...domProps}>{children}</Tag>;
      };
    }
  }),
  AnimatePresence: ({ children }) => <>{children}</>,
}));

// Mock Lucide React
vi.mock('lucide-react', () => {
  const mockIcon = (name) => ({ size, color, ...props }) => <div data-testid={`icon-${name}`} {...props} />;
  return {
    LayoutDashboard: mockIcon('layout-dashboard'),
    TrendingUp: mockIcon('trending-up'),
    Plane: mockIcon('plane'),
    Wrench: mockIcon('wrench'),
    Settings: mockIcon('settings'),
    LogOut: mockIcon('log-out'),
    Plus: mockIcon('plus'),
    BarChart2: mockIcon('bar-chart'),
    DollarSign: mockIcon('dollar-sign'),
    Car: mockIcon('car'),
    Sun: mockIcon('sun'),
    Moon: mockIcon('moon'),
    Menu: mockIcon('menu'),
    X: mockIcon('x'),
    ChevronLeft: mockIcon('chevron-left'),
    ChevronDown: mockIcon('chevron-down'),
    Eye: mockIcon('eye'),
    EyeOff: mockIcon('eye-off'),
    Calendar: mockIcon('calendar'),
  };
});

// Mock sub-components
vi.mock('./Finance/FinanceList', () => ({ default: () => <div data-testid="finance-list" /> }));
vi.mock('./Finance/SummaryDashboard', () => ({ default: () => <div data-testid="summary-dashboard" /> }));
vi.mock('./Finance/FinanceSettings', () => ({ default: () => <div data-testid="finance-settings" /> }));
vi.mock('./Finance/TransactionModal', () => ({ default: () => <div data-testid="transaction-modal" /> }));
vi.mock('./Settings', () => ({ default: () => <div data-testid="settings-view" /> }));
vi.mock('./MyCars/MyCars', () => ({ default: () => <div data-testid="my-cars" /> }));
vi.mock('./Trips/Trips', () => ({ default: () => <div data-testid="trips" /> }));
vi.mock('./Investments/Investments', () => ({ default: () => <div data-testid="investments" /> }));

describe('Dashboard Navigation', () => {
  const mockUser = { id: 'user-123', email: 'test@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('updates activeTab when set-active-tab event is dispatched', async () => {
    await act(async () => {
      render(<Dashboard user={mockUser} />);
    });
    
    await act(async () => {
      window.dispatchEvent(new CustomEvent('set-active-tab', { detail: { tab: 'trips-itinerary' } }));
    });
    
    expect(localStorage.getItem('personal-control-active-tab')).toBe('trips-itinerary');
  });

  it('handles navigate-to-itinerary event and sets tripId in localStorage', async () => {
    await act(async () => {
      render(<Dashboard user={mockUser} />);
    });
    
    await act(async () => {
      window.dispatchEvent(new CustomEvent('navigate-to-itinerary', { detail: { tripId: 'trip-abc' } }));
    });
    
    expect(localStorage.getItem('pc_selected_trip_v1')).toBe('trip-abc');
    expect(localStorage.getItem('personal-control-active-tab')).toBe('trips-itinerary');
  });
});
