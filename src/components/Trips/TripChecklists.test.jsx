import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TripChecklists from './TripChecklists';
import { supabase } from '../../lib/supabase';
import { clearTripsCache } from '../../lib/offline/db';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

function Wrapper({ children }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

// Mock Supabase
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
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

  beforeEach(async () => {
    vi.clearAllMocks();
    await clearTripsCache();
    queryClient.clear();
  });

  const setupSupabaseMocks = ({ checklists = [], newChecklist = null, newItem = null } = {}) => {
    vi.mocked(supabase.from).mockImplementation((table) => {
      const chain = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.insert = vi.fn().mockReturnValue(chain);
      chain.update = vi.fn().mockReturnValue(chain);
      chain.delete = vi.fn().mockReturnValue(chain);
      chain.order = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockReturnValue(chain);

      chain.single = vi.fn().mockImplementation(() => {
        if (table === 'trip_checklists' && newChecklist) {
          return Promise.resolve({ data: newChecklist, error: null });
        }
        if (table === 'trip_checklist_items' && newItem) {
          return Promise.resolve({ data: newItem, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      });

      chain.then = vi.fn().mockImplementation((resolve) => {
        if (table === 'trip_checklists') {
          return Promise.resolve({ data: checklists, error: null }).then(resolve);
        }
        return Promise.resolve({ data: [], error: null }).then(resolve);
      });

      return chain;
    });
  };

  it('renders correctly and loads checklists', async () => {
    const mockChecklists = [
      { 
        id: 'list-1', 
        trip_id: mockTrip.id,
        title: 'Checklist 1', 
        items: [{ id: 'item-1', checklist_id: 'list-1', task: 'Tarefa 1', completed: false }] 
      }
    ];

    setupSupabaseMocks({ checklists: mockChecklists });

    render(<TripChecklists user={mockUser} trip={mockTrip} onBack={() => {}} />, { wrapper: Wrapper });

    expect(screen.getByText('Viagem Teste')).toBeInTheDocument();
    
    await waitFor(() => {
      expect(screen.getByText('Checklist 1')).toBeInTheDocument();
      expect(screen.getByText('Tarefa 1')).toBeInTheDocument();
    });
  });

  it('allows adding a new checklist', async () => {
    const user = userEvent.setup();
    const newChecklist = { id: 'new-list', trip_id: mockTrip.id, title: 'Lista Nova', items: [] };
    
    setupSupabaseMocks({ 
      checklists: [], 
      newChecklist 
    });

    render(<TripChecklists user={mockUser} trip={mockTrip} onBack={() => {}} />, { wrapper: Wrapper });

    const addButton = screen.getByRole('button', { name: /nova lista/i });
    await user.click(addButton);

    const input = await screen.findByPlaceholderText('Ex: Documentos, Mala de Mão...');
    await user.type(input, 'Lista Nova');

    // Mudar mock para retornar a nova lista no próximo fetch
    setupSupabaseMocks({ checklists: [newChecklist] });

    const createButton = screen.getByRole('button', { name: /criar lista/i });
    await user.click(createButton);
    
    await waitFor(() => {
      expect(screen.getByText('Lista Nova')).toBeInTheDocument();
    });
  });

  it('allows adding an item to a checklist', async () => {
    const user = userEvent.setup();
    const mockChecklists = [{ id: 'list-1', trip_id: mockTrip.id, title: 'Checklist 1', items: [] }];
    const newItem = { id: 'item-1', checklist_id: 'list-1', task: 'Nova Tarefa', completed: false };

    setupSupabaseMocks({ 
      checklists: mockChecklists,
      newItem
    });

    render(<TripChecklists user={mockUser} trip={mockTrip} onBack={() => {}} />, { wrapper: Wrapper });

    await waitFor(() => screen.getByText('Checklist 1'));

    const addItemButton = screen.getByText('Adicionar item');
    await user.click(addItemButton);

    const input = await screen.findByPlaceholderText('O que precisa ser feito?');
    await user.type(input, 'Nova Tarefa');

    // Mudar mock para retornar a checklist com o item
    setupSupabaseMocks({ 
      checklists: [{ id: 'list-1', trip_id: mockTrip.id, title: 'Checklist 1', items: [newItem] }] 
    });

    const confirmButton = screen.getByRole('button', { name: /^adicionar$/i });
    await user.click(confirmButton);
    
    await waitFor(() => {
      expect(screen.getByText('Nova Tarefa')).toBeInTheDocument();
    });
  });

  it('allows toggling an item', async () => {
    const mockChecklists = [
      { 
        id: 'list-1', 
        trip_id: mockTrip.id,
        title: 'Checklist 1', 
        items: [{ id: 'item-1', checklist_id: 'list-1', task: 'Tarefa 1', completed: false }] 
      }
    ];

    setupSupabaseMocks({ checklists: mockChecklists });

    render(<TripChecklists user={mockUser} trip={mockTrip} onBack={() => {}} />, { wrapper: Wrapper });

    await waitFor(() => screen.getByText('Tarefa 1'));

    // Mudar mock para refletir o toggle
    const updatedItem = { id: 'item-1', checklist_id: 'list-1', task: 'Tarefa 1', completed: true };
    setupSupabaseMocks({ 
      checklists: [{ id: 'list-1', trip_id: mockTrip.id, title: 'Checklist 1', items: [updatedItem] }],
      newItem: updatedItem
    });

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
      { id: 'list-1', trip_id: mockTrip.id, title: 'Checklist 1', items: [{ id: 'item-1', checklist_id: 'list-1', task: 'Tarefa 1' }] },
      { id: 'list-2', trip_id: mockTrip.id, title: 'Checklist 2', items: [{ id: 'item-2', checklist_id: 'list-2', task: 'Tarefa 2' }] }
    ];
    
    setupSupabaseMocks({ checklists: mockChecklists });

    render(<TripChecklists user={mockUser} trip={mockTrip} onBack={() => {}} />, { wrapper: Wrapper });

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
