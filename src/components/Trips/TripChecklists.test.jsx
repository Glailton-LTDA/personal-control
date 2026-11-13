import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TripChecklists from './TripChecklists';
import { supabase } from '../../lib/supabase';
import { clearTripsCache } from '../../lib/offline/db';
import * as offlineDb from '../../lib/offline/db';

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

  it('keeps navigation available while the selected trip is restored or removed', async () => {
    setupSupabaseMocks();
    const onBack = vi.fn();
    const { rerender } = render(<TripChecklists user={mockUser} trip={null} onBack={onBack} />, { wrapper: Wrapper });
    expect(screen.getByText('Carregando informações da viagem...')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(onBack).toHaveBeenCalledOnce();
    expect(supabase.from).not.toHaveBeenCalledWith('trip_checklists');

    rerender(<TripChecklists user={mockUser} trip={mockTrip} onBack={onBack} />);
    expect(await screen.findByText('Viagem Teste')).toBeInTheDocument();
    rerender(<TripChecklists user={mockUser} trip={null} onBack={onBack} />);
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeInTheDocument();
  });

  it('waits for the session before exposing checklist actions', async () => {
    setupSupabaseMocks();
    const { rerender } = render(<TripChecklists user={null} trip={mockTrip} onBack={() => {}} />, { wrapper: Wrapper });
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeInTheDocument();
    expect(screen.queryByTestId('btn-add-checklist')).not.toBeInTheDocument();
    rerender(<TripChecklists user={mockUser} trip={mockTrip} onBack={() => {}} />);
    expect(await screen.findByTestId('btn-add-checklist')).toBeInTheDocument();
  });

  it('identifies the import dialog and allows closing and reopening it', async () => {
    setupSupabaseMocks();
    render(<TripChecklists user={mockUser} trip={mockTrip} onBack={() => {}} />, { wrapper: Wrapper });
    fireEvent.click(screen.getByTestId('import-checklist-btn'));
    expect(await screen.findByRole('dialog', { name: 'Importar de outras viagens' })).toHaveAttribute('aria-modal', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('import-checklist-btn'));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
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

  async function openItemEditor() {
    setupSupabaseMocks({ checklists: [{ id: 'list-1', trip_id: mockTrip.id, title: 'Checklist 1', items: [] }] });
    render(<TripChecklists user={mockUser} trip={mockTrip} onBack={() => {}} />, { wrapper: Wrapper });
    fireEvent.click(await screen.findByText('Adicionar item'));
    return screen.findByPlaceholderText('O que precisa ser feito?');
  }

  it('keeps the focused editor ready for consecutive items after Enter', async () => {
    const input = await openItemEditor();
    const user = userEvent.setup();
    await user.type(input, 'Passaporte{Enter}');
    await waitFor(() => expect(input).toHaveValue(''));
    expect(input).toHaveFocus();
    await user.type(input, 'Carregador{Enter}');
    await waitFor(() => expect(input).toHaveValue(''));
    expect(input).toHaveFocus();
    const items = await offlineDb.getTripChecklistItemsFromDexie('list-1');
    expect(items.map(item => item.task).sort()).toEqual(['Carregador', 'Passaporte']);
    fireEvent.blur(input);
    expect(input).toBeInTheDocument();
  });

  it('ignores blank, composing and repeated Enter without closing the editor', async () => {
    const input = await openItemEditor();
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.change(input, { target: { value: 'Documento' } });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    fireEvent.keyDown(input, { key: 'Enter', repeat: true });
    expect(await offlineDb.getTripChecklistItemsFromDexie('list-1')).toEqual([]);
    expect(input).toHaveValue('Documento');
  });

  it('does not duplicate a pending submission or reopen a cancelled editor', async () => {
    const input = await openItemEditor();
    let finish;
    const gate = new Promise(resolve => { finish = resolve; });
    const originalPut = offlineDb.putTripChecklistItemInDexie;
    const put = vi.spyOn(offlineDb, 'putTripChecklistItemInDexie').mockImplementationOnce(async item => {
      await gate;
      return originalPut(item);
    });
    try {
      fireEvent.change(input, { target: { value: 'Passaporte' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      fireEvent.keyDown(input, { key: 'Enter' });
      await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
      expect(input).toHaveAttribute('aria-busy', 'true');
      expect(input).not.toHaveAttribute('readonly');
      fireEvent.change(input, { target: { value: 'Alteração durante gravação' } });
      expect(input).toHaveValue('Passaporte');
      fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));
      await act(async () => { finish(); await gate; });
      await waitFor(() => expect(screen.queryByPlaceholderText('O que precisa ser feito?')).not.toBeInTheDocument());
      expect(await offlineDb.getTripChecklistItemsFromDexie('list-1')).toHaveLength(1);
      fireEvent.click(screen.getByText('Adicionar item'));
      expect(await screen.findByPlaceholderText('O que precisa ser feito?')).toHaveValue('');
    } finally {
      put.mockRestore();
    }
  });

  it('preserves the draft after a failed save and allows retry', async () => {
    const input = await openItemEditor();
    const put = vi.spyOn(offlineDb, 'putTripChecklistItemInDexie').mockRejectedValueOnce(new Error('synthetic storage failure'));
    try {
      const user = userEvent.setup();
      await user.type(input, 'Seguro viagem{Enter}');
      await waitFor(() => expect(input).toHaveAttribute('aria-busy', 'false'));
      expect(input).toHaveValue('Seguro viagem');
      await user.keyboard('{Enter}');
      await waitFor(() => expect(input).toHaveValue(''));
      expect(await offlineDb.getTripChecklistItemsFromDexie('list-1')).toHaveLength(1);
    } finally {
      put.mockRestore();
    }
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
