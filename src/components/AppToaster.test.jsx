import React from 'react';
import { act, fireEvent, render, screen, cleanup } from '@testing-library/react';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import toast from 'react-hot-toast';
import AppToaster from './AppToaster';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: () => 'Fechar' }) }));

beforeEach(() => { vi.useFakeTimers(); toast.remove(); });
afterEach(() => { cleanup(); toast.remove(); vi.useRealTimers(); });

describe('AppToaster', () => {
  it('sucessos empilhados expiram mesmo após hover e toque', () => {
    render(<AppToaster />);
    act(() => { toast.success('Excluído 1'); toast.success('Excluído 2'); toast.success('Excluído 3'); });
    fireEvent.mouseEnter(screen.getByTestId('toasts-top-right'));
    fireEvent.touchStart(screen.getByText('Excluído 1'));
    act(() => { vi.advanceTimersByTime(4100); });
    expect(screen.queryByText('Excluído 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Excluído 2')).not.toBeInTheDocument();
    expect(screen.queryByText('Excluído 3')).not.toBeInTheDocument();
  });

  it('fecha um aviso sem fechar os outros', () => {
    render(<AppToaster />);
    act(() => { toast.error('Erro 1'); toast.success('Salvo'); });
    fireEvent.click(screen.getByText('Erro 1').closest('[role="status"]').parentElement.querySelector('button'));
    expect(screen.queryByText('Erro 1')).not.toBeInTheDocument();
    expect(screen.getByText('Salvo')).toBeInTheDocument();
  });

  it('loading permanece até a operação resolver e o sucesso então expira', () => {
    render(<AppToaster />);
    let id;
    act(() => { id = toast.loading('Salvando'); });
    act(() => { vi.advanceTimersByTime(10000); });
    expect(screen.getByText('Salvando')).toBeInTheDocument();
    act(() => { toast.success('Pronto', { id }); });
    act(() => { vi.advanceTimersByTime(4100); });
    expect(screen.queryByText('Pronto')).not.toBeInTheDocument();
  });

  it('mantém os botões das confirmações funcionais', () => {
    const confirm = vi.fn();
    render(<AppToaster />);
    act(() => { toast(() => <button onClick={confirm}>Confirmar ação</button>, { duration: 6000 }); });
    fireEvent.click(screen.getByText('Confirmar ação'));
    expect(confirm).toHaveBeenCalledTimes(1);
  });
});
