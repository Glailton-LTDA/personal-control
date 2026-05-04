import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import Settings from './Settings';
import { supabase } from '../lib/supabase';

// Mock supabase
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  }
}));

// Mock Framer Motion
vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: (target, prop) => {
      return ({ children, ...props }) => {
        const Tag = prop;
        const { _animate, _initial, _exit, _transition, _whileHover, _whileTap, _layout, ...domProps } = props;
        return <Tag {...domProps}>{children}</Tag>;
      };
    }
  }),
  AnimatePresence: ({ children }) => <>{children}</>,
}));

describe('Settings Component', () => {
  const mockUser = { id: 'user-123', email: 'test@example.com' };
  const mockMenuOrder = ['finances', 'cars'];
  const mockMenuItems = [
    { id: 'finances', label: 'Finanças', icon: () => null },
    { id: 'cars', label: 'Carros', icon: () => null }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders general settings when activeTab is settings-general', async () => {
    const mockSelect = vi.fn().mockReturnThis();
    const mockSingle = vi.fn().mockResolvedValue({ 
      data: { recipient_email: 'test@example.com', bcc_email: '', skip_email_modal: false, skip_confirmations: false, auto_send_on_paid: false }, 
      error: null 
    });
    
    vi.mocked(supabase.from).mockReturnValue({
      select: mockSelect,
      single: mockSingle,
    });

    await act(async () => {
      render(
        <Settings 
          user={mockUser} 
          menuOrder={mockMenuOrder} 
          setMenuOrder={vi.fn()} 
          menuItems={mockMenuItems} 
          activeTab="settings-general" 
        />
      );
    });
    
    expect(await screen.findByTestId('section-menu-order')).toBeDefined();
    expect(screen.getByTestId('section-notifications')).toBeDefined();
    expect(screen.queryByTestId('section-security')).toBeNull();
  });

  it('renders security settings when activeTab is settings-security', async () => {
    const mockSelect = vi.fn().mockReturnThis();
    const mockSingle = vi.fn().mockResolvedValue({ 
      data: { recipient_email: 'test@example.com', bcc_email: '', skip_email_modal: false, skip_confirmations: false, auto_send_on_paid: false }, 
      error: null 
    });
    
    vi.mocked(supabase.from).mockReturnValue({
      select: mockSelect,
      single: mockSingle,
    });

    await act(async () => {
      render(
        <Settings 
          user={mockUser} 
          menuOrder={mockMenuOrder} 
          setMenuOrder={vi.fn()} 
          menuItems={mockMenuItems} 
          activeTab="settings-security" 
        />
      );
    });
    
    expect(await screen.findByTestId('section-security')).toBeDefined();
    expect(screen.queryByTestId('section-menu-order')).toBeNull();
    expect(screen.queryByTestId('section-notifications')).toBeNull();
  });
});
