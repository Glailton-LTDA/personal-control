import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MFAccountModal from './MFAccountModal';

const { updateMock, createMock, savePrefsMock } = vi.hoisted(() => ({
  updateMock: vi.fn(),
  createMock: vi.fn(),
  savePrefsMock: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { language: 'pt-BR', changeLanguage: vi.fn() },
  }),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}));

vi.mock('../../hooks/mfProfileContext', () => ({
  useMFProfileScope: () => null,
}));

vi.mock('../../hooks/useMinhasFinancas', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useCreateAccount: () => ({ mutateAsync: createMock }),
    useUpdateAccount: () => ({ mutateAsync: updateMock }),
    useCreateAccountType: () => ({ mutateAsync: vi.fn() }),
    useMFAccounts: () => ({ data: [] }),
    useMFAccountTypes: () => ({ data: [] }),
    useMFProfiles: () => ({ data: [] }),
    useMFGroups: () => ({ data: [] }),
    useMFPrefs: () => ({
      prefs: { defaultTransferAccountId: 'acc-1' },
      save: savePrefsMock,
    }),
  };
});

const account = {
  id: 'acc-1',
  name: 'Nuconta',
  account_type: 'CORRENTE',
  currency: 'BRL',
  initial_balance: 0,
  color: '#6366f1',
};

const renderModal = (target = account) =>
  render(
    <MFAccountModal
      isOpen
      account={target}
      user={{ id: 'u1' }}
      onClose={() => {}}
    />
  );

describe('MFAccountModal — conta padrão de transferência', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateMock.mockResolvedValue({ id: 'acc-1' });
  });

  it('marca a conta que já é o destino padrão', () => {
    renderModal();
    expect(screen.getByTestId('mf-account-default-transfer')).toBeChecked();
  });

  it('desmarcar limpa a preferência ao salvar', async () => {
    renderModal();
    fireEvent.click(screen.getByTestId('mf-account-default-transfer'));
    fireEvent.click(screen.getByTestId('mf-account-save'));

    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    expect(savePrefsMock).toHaveBeenCalledWith({ defaultTransferAccountId: null });
  });

  it('marcar outra conta a torna a padrão ao salvar', async () => {
    updateMock.mockResolvedValue({ id: 'acc-2' });
    renderModal({ ...account, id: 'acc-2', name: 'Itaú' });

    const checkbox = screen.getByTestId('mf-account-default-transfer');
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByTestId('mf-account-save'));

    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    expect(savePrefsMock).toHaveBeenCalledWith({ defaultTransferAccountId: 'acc-2' });
  });
});
