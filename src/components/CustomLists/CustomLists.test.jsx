import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CustomLists from './CustomLists';
import { supabase } from '../../lib/supabase';

// Mock supabase
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: vi.fn((cb) => cb({ data: [], error: null })),
    })),
  }
}));

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: {
      changeLanguage: vi.fn(),
      language: 'pt-BR',
    },
  }),
}));


const mockUser = { id: 'user-123', email: 'test@example.com' };

describe('CustomLists Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly and shows empty state', async () => {
    render(<CustomLists user={mockUser} />);
    
    expect(screen.getByText('lists.collections')).toBeDefined();
    expect(screen.getByText('lists.select_collection')).toBeDefined();
  });

  it('opens new list modal when clicking add button', async () => {
    render(<CustomLists user={mockUser} />);

    const addBtn = screen.getByTestId('btn-add-collection');
    fireEvent.click(addBtn);
    
    expect(screen.getByText('lists.new_list')).toBeDefined();
  });

  it('includes "Texto Longo" option in field type selector', async () => {
    render(<CustomLists user={mockUser} />);

    const addBtn = screen.getByTestId('btn-add-collection');
    fireEvent.click(addBtn);

    const selects = screen.getAllByRole('combobox');
    const fieldTypeSelect = selects.find(s => {
      const options = Array.from(s.querySelectorAll('option'));
      return options.some(o => o.textContent === 'lists.field_types.text');
    });

    expect(fieldTypeSelect).toBeDefined();
    const options = Array.from(fieldTypeSelect.querySelectorAll('option'));
    const textareaOption = options.find(o => o.textContent === 'lists.field_types.textarea');
    expect(textareaOption).toBeDefined();
    expect(textareaOption.value).toBe('textarea');
  });

  it('renders sorting selector when a list is selected', async () => {
    const mockLists = [
      { id: 'list-123', name: 'My List', user_id: 'user-123', fields: [{ id: 'field-1', name: 'Date Field', type: 'date' }] }
    ];
    const mockItems = [
      { id: 'item-1', list_id: 'list-123', user_id: 'user-123', completed: false, content: '{"field-1":"2026-06-25"}', order_index: 0, created_at: '2026-06-20T00:00:00Z' }
    ];

    vi.spyOn(supabase, 'from').mockImplementation((table) => {
      let data = [];
      if (table === 'custom_lists') data = mockLists;
      if (table === 'custom_list_items') data = mockItems;
      return {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        then: vi.fn((cb) => cb({ data, error: null }))
      };
    });

    render(<CustomLists user={mockUser} />);

    await waitFor(() => {
      expect(screen.getByTestId('select-sort-by')).toBeDefined();
    });
  });
});
