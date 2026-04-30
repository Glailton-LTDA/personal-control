import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }) => <div {...props}>{children}</div>,
    section: ({ children, ...props }) => <section {...props}>{children}</section>,
    h3: ({ children, ...props }) => <h3 {...props}>{children}</h3>,
    p: ({ children, ...props }) => <p {...props}>{children}</p>,
    button: ({ children, ...props }) => <button {...props}>{children}</button>,
    header: ({ children, ...props }) => <header {...props}>{children}</header>,
  },
  AnimatePresence: ({ children }) => <>{children}</>,
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
          order: vi.fn().mockResolvedValue({ data: mockChecklists, error: null }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
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
    const user = userEvent.setup();
    supabase.from.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
      insert: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'new-list', title: 'Lista Nova' }, error: null }),
    }));


    render(<TripChecklists user={mockUser} trip={mockTrip} onBack={() => {}} />);

    const addButton = screen.getByRole('button', { name: /nova lista/i });
    await user.click(addButton);

    const input = await screen.findByPlaceholderText('Ex: Documentos, Mala de Mão...');
    await user.type(input, 'Lista Nova');

    const createButton = screen.getByRole('button', { name: /criar lista/i });
    await user.click(createButton);
    
    await waitFor(() => {
      expect(screen.getByText('Lista Nova')).toBeInTheDocument();
    });
  });

  it('allows adding an item to a checklist', async () => {
    const user = userEvent.setup();
    const mockChecklists = [{ id: 'list-1', title: 'Checklist 1', items: [] }];
    
    supabase.from.mockImplementation((table) => {
      if (table === 'trip_checklists') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: mockChecklists, error: null }),
        };
      }
      return {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: 'item-1', task: 'Nova Tarefa', completed: false }, error: null }),
      };
    });


    render(<TripChecklists user={mockUser} trip={mockTrip} onBack={() => {}} />);

    await waitFor(() => screen.getByText('Checklist 1'));

    const addItemButton = screen.getByText('Adicionar item');
    await user.click(addItemButton);

    const input = await screen.findByPlaceholderText('O que precisa ser feito?');
    await user.type(input, 'Nova Tarefa');

    const confirmButton = screen.getByRole('button', { name: /^adicionar$/i });
    await user.click(confirmButton);
    
    await waitFor(() => {
      expect(screen.getByText('Nova Tarefa')).toBeInTheDocument();
    }, { timeout: 3000 });
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
          order: vi.fn().mockResolvedValue({ data: mockChecklists, error: null }),
        };
      }
      return {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
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

  it('allows collapsing/expanding all checklists', async () => {
    const user = userEvent.setup();
    const mockChecklists = [
      { id: 'list-1', title: 'Checklist 1', items: [{ id: 'item-1', task: 'Tarefa 1' }] },
      { id: 'list-2', title: 'Checklist 2', items: [{ id: 'item-2', task: 'Tarefa 2' }] }
    ];
    
    supabase.from.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: mockChecklists, error: null }),
    }));

    render(<TripChecklists user={mockUser} trip={mockTrip} onBack={() => {}} />);

    await waitFor(() => screen.getByText('Checklist 1'));
    
    expect(screen.getByText('Tarefa 1')).toBeInTheDocument();

    const collapseButton = screen.getByText(/recolher/i);
    await user.click(collapseButton);

    // After collapse, items should not be visible
    expect(screen.queryByText('Tarefa 1')).not.toBeInTheDocument();

    const expandButton = screen.getByText(/expandir/i);
    await user.click(expandButton);
    expect(screen.getByText('Tarefa 1')).toBeInTheDocument();
  });
});
