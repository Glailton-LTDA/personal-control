import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Settings from './Settings';
import { supabase } from '../lib/supabase';

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, defaultValue) => defaultValue || key,
    i18n: {
      changeLanguage: vi.fn(),
      language: 'pt-BR',
    },
  }),
}));

// Mock supabase
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
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

// Mock Offline DB
const mockQueueCount = vi.fn().mockResolvedValue(3);
vi.mock('../lib/offline/db', () => ({
  db: {
    sync_queue: {
      count: () => mockQueueCount()
    }
  }
}));

// Mock SyncEngine
const mockSyncFn = vi.fn().mockResolvedValue(undefined);
vi.mock('../lib/offline/SyncEngine', () => {
  return {
    SyncEngine: vi.fn().mockImplementation(() => ({
      sync: mockSyncFn
    }))
  };
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

describe('Settings Component', () => {
  const mockUser = { id: 'user-123', email: 'test@example.com' };
  const mockMenuOrder = ['finances', 'cars'];
  const mockMenuItems = [
    { id: 'finances', label: 'Finanças', icon: () => null },
    { id: 'cars', label: 'Carros', icon: () => null }
  ];

  let queryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
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
        <QueryClientProvider client={queryClient}>
          <Settings 
            user={mockUser} 
            menuOrder={mockMenuOrder} 
            setMenuOrder={vi.fn()} 
            menuItems={mockMenuItems} 
            activeTab="settings-general" 
          />
        </QueryClientProvider>
      );
    });
    
    expect(await screen.findByTestId('section-menu-order')).toBeDefined();
    expect(screen.getByTestId('section-notifications')).toBeDefined();
    expect(screen.getByTestId('section-sync')).toBeDefined();
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
        <QueryClientProvider client={queryClient}>
          <Settings 
            user={mockUser} 
            menuOrder={mockMenuOrder} 
            setMenuOrder={vi.fn()} 
            menuItems={mockMenuItems} 
            activeTab="settings-security" 
          />
        </QueryClientProvider>
      );
    });
    
    expect(await screen.findByTestId('section-security')).toBeDefined();
    expect(screen.queryByTestId('section-menu-order')).toBeNull();
    expect(screen.queryByTestId('section-notifications')).toBeNull();
  });

  it('renders Database & Sync card and handles manual sync', async () => {
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
        <QueryClientProvider client={queryClient}>
          <Settings 
            user={mockUser} 
            menuOrder={mockMenuOrder} 
            setMenuOrder={vi.fn()} 
            menuItems={mockMenuItems} 
            activeTab="settings-general" 
          />
        </QueryClientProvider>
      );
    });

    expect(screen.getByTestId('section-sync')).toBeDefined();
    expect(screen.getAllByText('Online').length).toBe(2);
    expect(screen.getByText('3')).toBeDefined();

    const syncButton = screen.getByRole('button', { name: /Sincronizar Agora/i });
    await act(async () => {
      await userEvent.click(syncButton);
    });

    expect(mockSyncFn).toHaveBeenCalled();
  });

  it('renders visible modules toggle and handles module visibility changes', async () => {
    const mockSelect = vi.fn().mockReturnThis();
    const mockSingle = vi.fn().mockResolvedValue({ 
      data: { recipient_email: 'test@example.com', bcc_email: '', skip_email_modal: false, skip_confirmations: false, auto_send_on_paid: false }, 
      error: null 
    });
    
    vi.mocked(supabase.from).mockReturnValue({
      select: mockSelect,
      single: mockSingle,
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    });

    const setVisibleModulesMock = vi.fn();
    const visibleModules = ['finances', 'cars'];

    await act(async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <Settings 
            user={mockUser} 
            menuOrder={mockMenuOrder} 
            setMenuOrder={vi.fn()} 
            menuItems={mockMenuItems} 
            activeTab="settings-general"
            visibleModules={visibleModules}
            setVisibleModules={setVisibleModulesMock}
          />
        </QueryClientProvider>
      );
    });

    expect(screen.getByTestId('section-visible-modules')).toBeDefined();
    
    const financesCheckbox = screen.getByTestId('module-visibility-check-finances');
    expect(financesCheckbox.checked).toBe(true);

    await act(async () => {
      await userEvent.click(financesCheckbox);
    });
    expect(setVisibleModulesMock).toHaveBeenCalledWith(['cars']);
  });
});

