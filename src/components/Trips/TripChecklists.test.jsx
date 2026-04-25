import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TripChecklists from './TripChecklists';
import { supabase } from '../../lib/supabase';

// Mock Supabase
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
    })),
  },
}));

describe('TripChecklists', () => {
  const mockUser = { id: 'user-123' };
  const mockTrip = { id: 'trip-456', title: 'Viagem Teste' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly and loads checklists', async () => {
    const mockChecklists = [
      { 
        id: 'list-1', 
        title: 'Checklist 1', 
        items: [{ id: 'item-1', task: 'Tarefa 1', completed: false }] 
      }
    ];

    // Mock successful fetch
    supabase.from.mockImplementation((table) => {
      if (table === 'trip_checklists') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnValue({ data: mockChecklists, error: null }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnValue({ data: null, error: null }),
      };
    });

    render(<TripChecklists user={mockUser} trip={mockTrip} onBack={() => {}} />);

    expect(screen.getByText('Viagem Teste')).toBeInTheDocument();
    
    await waitFor(() => {
      expect(screen.getByText('Checklist 1')).toBeInTheDocument();
      expect(screen.getByText('Tarefa 1')).toBeInTheDocument();
    });
  });

  it('allows adding a new checklist', async () => {
    supabase.from.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnValue({ data: [], error: null }),
      insert: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnValue({ data: { id: 'new-list', title: 'Lista Nova' }, error: null }),
    }));

    vi.spyOn(window, 'prompt').mockReturnValue('Lista Nova');

    render(<TripChecklists user={mockUser} trip={mockTrip} onBack={() => {}} />);

    const addButton = screen.getByText('Nova Lista');
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(supabase.from).toHaveBeenCalledWith('trip_checklists');
      expect(screen.getByText('Lista Nova')).toBeInTheDocument();
    });
  });

  it('allows adding an item to a checklist', async () => {
    const mockChecklists = [{ id: 'list-1', title: 'Checklist 1', items: [] }];
    
    supabase.from.mockImplementation((table) => {
      if (table === 'trip_checklists') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnValue({ data: mockChecklists, error: null }),
        };
      }
      return {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnValue({ data: { id: 'item-1', task: 'Nova Tarefa', completed: false }, error: null }),
      };
    });

    vi.spyOn(window, 'prompt').mockReturnValue('Nova Tarefa');

    render(<TripChecklists user={mockUser} trip={mockTrip} onBack={() => {}} />);

    await waitFor(() => screen.getByText('Checklist 1'));
    
    const addItemButton = screen.getByText('Adicionar item');
    fireEvent.click(addItemButton);

    await waitFor(() => {
      expect(screen.getByText('Nova Tarefa')).toBeInTheDocument();
    });
  });

  it('allows toggling an item', async () => {
    const mockChecklists = [
      { 
        id: 'list-1', 
        title: 'Checklist 1', 
        items: [{ id: 'item-1', task: 'Tarefa 1', completed: false }] 
      }
    ];

    supabase.from.mockImplementation((table) => {
      if (table === 'trip_checklists') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnValue({ data: mockChecklists, error: null }),
        };
      }
      return {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnValue({ error: null }),
      };
    });

    render(<TripChecklists user={mockUser} trip={mockTrip} onBack={() => {}} />);

    await waitFor(() => screen.getByText('Tarefa 1'));

    // Find the toggle button next to the text
    const itemRow = screen.getByText('Tarefa 1').closest('div');
    const toggleButton = itemRow.querySelector('button');
    fireEvent.click(toggleButton);

    await waitFor(() => {
      expect(supabase.from).toHaveBeenCalledWith('trip_checklist_items');
    });
  });
});
