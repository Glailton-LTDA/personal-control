import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import toast from 'react-hot-toast';
import MFGoalDetail from './MFGoalDetail';

const hookMocks = vi.hoisted(() => ({
  add: vi.fn(),
  remove: vi.fn(),
  update: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, params) => {
      if (params && params.pct != null) return `${key}:${params.pct}`;
      if (params && params.name != null) return `${key}:${params.name}`;
      return key;
    },
  }),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}));

vi.mock('../../hooks/useMinhasFinancas', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useAddMFGoalContribution: () => ({ mutateAsync: hookMocks.add }),
    useDeleteMFGoalContribution: () => ({ mutateAsync: hookMocks.remove }),
    useUpdateMFGoal: () => ({ mutateAsync: hookMocks.update }),
  };
});

vi.mock('../../lib/toast', () => ({
  confirmToast: (...args) => hookMocks.confirm(...args),
}));

const baseGoal = {
  id: 'g1',
  name: 'Reserva',
  target_amount: 5000,
  initial_amount: 1000,
  target_date: '2099-12-31',
  account_id: null,
  color: '#6366f1',
  icon: '🎯',
  status: 'ACTIVE',
};

const renderDetail = (overrides = {}) => {
  const props = {
    goal: baseGoal,
    contributions: [],
    balance: undefined,
    balanceKnown: true,
    accountsById: {},
    user: { id: 'test-user' },
    showValues: true,
    onClose: vi.fn(),
    onEdit: vi.fn(),
    ...overrides,
  };
  return { ...render(<MFGoalDetail {...props} />), props };
};

const openDepositForm = () => {
  fireEvent.click(screen.getByTestId('mf-goal-detail-tab-deposits'));
  fireEvent.click(screen.getByTestId('mf-goal-detail-add'));
};

describe('MFGoalDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hookMocks.add.mockResolvedValue({});
    hookMocks.remove.mockResolvedValue('deleted');
    hookMocks.update.mockResolvedValue({});
    hookMocks.confirm.mockImplementation((_message, onConfirm) => onConfirm());
  });

  it('não renderiza nada sem objetivo', () => {
    const { container } = renderDetail({ goal: null });
    expect(container).toBeEmptyDOMElement();
  });

  it('mostra progresso manual, prazo, mensal ideal e movimentos', () => {
    renderDetail({
      contributions: [
        {
          id: 'c1',
          goal_id: 'g1',
          kind: 'DEPOSIT',
          amount: 1500,
          contribution_date: '2026-10-01',
          notes: 'Aporte extra',
        },
        {
          id: 'c2',
          goal_id: 'g1',
          kind: 'WITHDRAW',
          amount: 200,
          contribution_date: '2026-09-01',
          notes: null,
          transaction_id: 'tx-9',
        },
        {
          id: 'other',
          goal_id: 'g2',
          kind: 'DEPOSIT',
          amount: 999,
          contribution_date: '2026-01-01',
        },
      ],
    });

    expect(screen.getByTestId('mf-goal-detail-current')).toHaveTextContent('R$ 2.300,00');
    expect(screen.getByTestId('mf-goal-detail-ring')).toHaveAttribute('data-pct', '46');
    expect(screen.getByTestId('mf-goal-detail-pct')).toHaveTextContent('46%');
    expect(screen.getByTestId('mf-goal-detail-target')).toHaveTextContent('R$ 5.000,00');
    expect(screen.getByTestId('mf-goal-detail-date')).toHaveTextContent('31/12/2099');
    expect(screen.getByTestId('mf-goal-detail-monthly')).not.toHaveTextContent('—');
    expect(screen.getByTestId('mf-goal-detail-remaining')).toHaveTextContent('R$ 2.700,00');
    expect(screen.getByTestId('mf-goal-detail-simulation')).toHaveTextContent(
      'minhasfinancas.gl_simulation_text'
    );
    expect(screen.getByText('minhasfinancas.gl_active')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mf-goal-detail-tab-deposits'));
    expect(screen.getByTestId('mf-goal-detail-panel-deposits')).toBeInTheDocument();
    expect(screen.getByTestId('mf-goal-detail-tab-deposits')).toHaveTextContent('(2)');
    expect(screen.getByTestId('mf-goal-detail-deposit-c1')).toHaveTextContent('R$ 1.500,00');
    expect(screen.getByTestId('mf-goal-detail-deposit-c1')).toHaveTextContent('Aporte extra');
    expect(screen.getByTestId('mf-goal-detail-deposit-c2')).toHaveTextContent('200,00');
    expect(screen.getByTitle('minhasfinancas.gl_deposit_from_tx')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mf-goal-detail-deposit-del-c1'));
    expect(hookMocks.confirm).toHaveBeenCalled();
    return waitFor(() => {
      expect(hookMocks.remove).toHaveBeenCalledWith('c1');
      expect(toast.success).toHaveBeenCalledWith('minhasfinancas.cfg_deleted');
    }).then(() => {
      hookMocks.remove.mockRejectedValueOnce(new Error('offline'));
      fireEvent.click(screen.getByTestId('mf-goal-detail-deposit-del-c2'));
      return waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('minhasfinancas.save_error');
      });
    });
  });

  it('objetivo atingido usa cor de conclusão, 100% e simulação de concluído', () => {
    renderDetail({
      goal: {
        ...baseGoal,
        initial_amount: 6000,
        target_amount: 5000,
        color: null,
      },
    });

    expect(screen.getByTestId('mf-goal-detail-current')).toHaveTextContent('R$ 6.000,00');
    expect(screen.getByTestId('mf-goal-detail-ring')).toHaveAttribute('data-pct', '100');
    expect(screen.getByTestId('mf-goal-detail-remaining')).toHaveTextContent('R$ 0,00');
    expect(screen.getByTestId('mf-goal-detail-simulation')).toHaveTextContent(
      'minhasfinancas.gl_simulation_reached'
    );
    expect(screen.getAllByText('minhasfinancas.gl_completed').length).toBeGreaterThan(0);
  });

  it('mostra objetivo arquivado e prazo vencido', () => {
    renderDetail({
      goal: { ...baseGoal, status: 'ARCHIVED', target_date: '2020-01-01' },
    });

    expect(screen.getByText('minhasfinancas.gl_archived')).toBeInTheDocument();
    expect(screen.getByTestId('mf-goal-detail-simulation')).toHaveTextContent(
      'minhasfinancas.gl_simulation_late'
    );
    expect(screen.getByTestId('mf-goal-detail-monthly')).toHaveTextContent('R$ 4.000,00');
  });

  it('sem data e sem meta usa fallbacks da tela', () => {
    renderDetail({
      goal: {
        ...baseGoal,
        target_amount: 0,
        target_date: null,
        icon: null,
        color: null,
      },
    });

    expect(screen.getByTestId('mf-goal-detail-target')).toHaveTextContent('R$ 0,00');
    expect(screen.getByTestId('mf-goal-detail-date')).toHaveTextContent(
      'minhasfinancas.gl_no_date'
    );
    expect(screen.getByTestId('mf-goal-detail-monthly')).toHaveTextContent('—');
    expect(screen.getByTestId('mf-goal-detail-remaining')).toHaveTextContent('R$ 0,00');
    expect(screen.getByTestId('mf-goal-detail-ring')).toHaveAttribute('data-pct', '0');
    expect(screen.getByTestId('mf-goal-detail-simulation')).toHaveTextContent(
      'minhasfinancas.gl_simulation_no_date'
    );
    expect(screen.getByText('🎯')).toBeInTheDocument();
  });

  it('tolera data de alvo incompleta', () => {
    renderDetail({ goal: { ...baseGoal, target_date: '2026' } });

    expect(screen.getByTestId('mf-goal-detail-date')).toBeEmptyDOMElement();
    expect(screen.getByTestId('mf-goal-detail-monthly')).toHaveTextContent('—');
    expect(screen.getByTestId('mf-goal-detail-simulation')).toHaveTextContent(
      'minhasfinancas.gl_simulation_text'
    );
  });

  it('tolera data de alvo truncada', () => {
    renderDetail({ goal: { ...baseGoal, target_date: '999999-01-01' } });

    expect(screen.getByTestId('mf-goal-detail-date')).toBeEmptyDOMElement();
    expect(screen.getByTestId('mf-goal-detail-monthly')).toHaveTextContent('—');
  });

  it('aguarda o saldo da conta vinculada antes de calcular o progresso', () => {
    renderDetail({
      goal: { ...baseGoal, account_id: 'acc-1', icon: 'brand:nubank' },
      balanceKnown: false,
    });

    expect(screen.getByTestId('mf-goal-detail-current')).toHaveTextContent('…');
    expect(screen.getByTestId('mf-goal-detail-pct')).toHaveTextContent('…');
    expect(screen.getByTestId('mf-goal-detail-remaining')).toHaveTextContent('…');
    expect(screen.getByTestId('mf-goal-detail-monthly')).toHaveTextContent('—');
    expect(screen.getByTestId('mf-goal-detail-simulation')).toHaveTextContent(
      'minhasfinancas.gl_simulation_calc'
    );
    // Ícone do tipo "brand:...": renderiza o componente de ícone da conta.
    expect(screen.getByTitle('Reserva')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mf-goal-detail-tab-deposits'));
    expect(screen.getByTestId('mf-goal-detail-linked-hint')).toHaveTextContent(
      'minhasfinancas.gl_deposit_linked_hint'
    );
    expect(screen.queryByTestId('mf-goal-detail-add')).not.toBeInTheDocument();
  });

  it('objetivo vinculado usa o saldo da conta e respeita valores ocultos', () => {
    renderDetail({
      goal: {
        ...baseGoal,
        account_id: 'acc-1',
        target_amount: 3000,
        color: null,
        icon: 'brand:nubank',
      },
      balance: 1500,
      accountsById: {
        'acc-1': { id: 'acc-1', name: 'Nubank', currency: 'USD' },
      },
      showValues: false,
    });

    expect(screen.getByTestId('mf-goal-detail-current')).toHaveTextContent('•••');
    expect(screen.getByTestId('mf-goal-detail-target')).toHaveTextContent('•••');
    expect(screen.getByTestId('mf-goal-detail-remaining')).toHaveTextContent('•••');
    expect(screen.getByTestId('mf-goal-detail-pct')).toHaveTextContent('50%');
    expect(screen.getByText(/gl_linked_hint/)).toHaveTextContent('Nubank');

    fireEvent.click(screen.getByTestId('mf-goal-detail-tab-deposits'));
    expect(screen.getByTestId('mf-goal-detail-linked-hint')).toHaveTextContent('Nubank');
  });
  it('registra aporte ou retirada com data e observações', async () => {
    renderDetail();
    openDepositForm();

    fireEvent.click(screen.getByTestId('mf-goal-detail-kind'));
    fireEvent.click(screen.getByTestId('mf-goal-detail-kind-option-WITHDRAW'));
    fireEvent.change(screen.getByTestId('mf-goal-detail-amount'), {
      target: { value: '100,00' },
    });
    fireEvent.change(screen.getByTestId('mf-goal-detail-date-input'), {
      target: { value: '2026-05-05' },
    });
    fireEvent.change(screen.getByTestId('mf-goal-detail-notes'), {
      target: { value: '  Reserva  ' },
    });
    fireEvent.click(screen.getByTestId('mf-goal-detail-save'));

    await waitFor(() => {
      expect(hookMocks.add).toHaveBeenCalledWith({
        user_id: 'test-user',
        goal_id: 'g1',
        kind: 'WITHDRAW',
        amount: 100,
        contribution_date: '2026-05-05',
        notes: 'Reserva',
      });
    });
    expect(toast.success).toHaveBeenCalledWith('minhasfinancas.gl_mov_saved');
    expect(screen.queryByTestId('mf-goal-detail-contrib-form')).not.toBeInTheDocument();
  });

  it('usa a data de hoje quando o campo de data fica vazio e conclui a meta', async () => {
    renderDetail({ goal: { ...baseGoal, initial_amount: 4500 } });
    openDepositForm();

    fireEvent.change(screen.getByTestId('mf-goal-detail-amount'), {
      target: { value: '500,00' },
    });
    fireEvent.change(screen.getByTestId('mf-goal-detail-date-input'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByTestId('mf-goal-detail-save'));

    await waitFor(() => {
      expect(hookMocks.add).toHaveBeenCalledTimes(1);
    });
    const payload = hookMocks.add.mock.calls[0][0];
    expect(payload.amount).toBe(500);
    expect(payload.kind).toBe('DEPOSIT');
    expect(payload.contribution_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(hookMocks.update).toHaveBeenCalledWith({ id: 'g1', status: 'COMPLETED' });
    expect(toast.success).toHaveBeenCalledWith('minhasfinancas.gl_target_reached');
  });

  it('valida valor zero antes de salvar', () => {
    renderDetail();
    openDepositForm();

    fireEvent.change(screen.getByTestId('mf-goal-detail-amount'), {
      target: { value: '0,00' },
    });
    fireEvent.click(screen.getByTestId('mf-goal-detail-save'));

    expect(toast.error).toHaveBeenCalledWith('minhasfinancas.tx_amount_required');
    expect(hookMocks.add).not.toHaveBeenCalled();
  });

  it('mostra erro quando o aporte falha e mantém o formulário aberto', async () => {
    hookMocks.add.mockRejectedValueOnce(new Error('offline'));
    renderDetail();
    openDepositForm();

    fireEvent.change(screen.getByTestId('mf-goal-detail-amount'), {
      target: { value: '150,00' },
    });
    fireEvent.click(screen.getByTestId('mf-goal-detail-save'));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('minhasfinancas.save_error');
    });
    expect(screen.getByTestId('mf-goal-detail-contrib-form')).toBeInTheDocument();
    expect(screen.getByTestId('mf-goal-detail-save')).not.toBeDisabled();
  });

  it('cancela o formulário de aporte e limpa os campos', () => {
    renderDetail();
    openDepositForm();

    fireEvent.change(screen.getByTestId('mf-goal-detail-amount'), {
      target: { value: '99,00' },
    });
    fireEvent.click(screen.getByText('minhasfinancas.cancel'));
    expect(screen.queryByTestId('mf-goal-detail-contrib-form')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mf-goal-detail-add'));
    expect(screen.getByTestId('mf-goal-detail-amount')).toHaveValue('');
  });

  it('alterna o formulário pelo botão de novo depósito', () => {
    renderDetail();
    fireEvent.click(screen.getByTestId('mf-goal-detail-tab-deposits'));

    fireEvent.click(screen.getByTestId('mf-goal-detail-add'));
    expect(screen.getByTestId('mf-goal-detail-contrib-form')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mf-goal-detail-add'));
    expect(screen.queryByTestId('mf-goal-detail-contrib-form')).not.toBeInTheDocument();
  });

  it('fecha por Escape, botão, overlay e edita sem fechar pelo conteúdo', () => {
    const { props } = renderDetail();

    fireEvent.keyDown(window, { key: 'a' });
    expect(props.onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('mf-goal-detail-close'));
    expect(props.onClose).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByTestId('mf-goal-detail'));
    expect(props.onClose).toHaveBeenCalledTimes(3);

    fireEvent.click(screen.getByTestId('mf-goal-detail').firstChild);
    expect(props.onClose).toHaveBeenCalledTimes(3);

    fireEvent.click(screen.getByTestId('mf-goal-detail-edit'));
    expect(props.onEdit).toHaveBeenCalledTimes(1);
  });
});
