import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CustomLists from './CustomLists';

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

    // The field type select should contain "lists.field_types.text" as an option text
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
});
