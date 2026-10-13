import {
  ArrowLeftRight,
  CreditCard,
  MinusCircle,
  PlusCircle,
  RotateCcw,
  Wallet,
} from 'lucide-react';

/**
 * Opções do menu "+" — mesmos ícones/cores do app original:
 * despesa (− vermelho), despesa no cartão (💳), receita (+ verde),
 * transferência (⇄ índigo) e estorno (↺ verde); "Nova conta" (wallet)
 * existe só no FAB global (a tela de Lançamentos é só de lançamentos).
 */
export const MF_ADD_OPTIONS = {
  account: { Icon: Wallet, color: 'var(--primary)', labelKey: 'minhasfinancas.new_account' },
  expense: { Icon: MinusCircle, color: '#ef4444', labelKey: 'minhasfinancas.add_expense' },
  cardExpense: { Icon: CreditCard, color: '#3b82f6', labelKey: 'minhasfinancas.add_card_expense' },
  income: { Icon: PlusCircle, color: '#10b981', labelKey: 'minhasfinancas.add_income' },
  transfer: { Icon: ArrowLeftRight, color: '#6366f1', labelKey: 'minhasfinancas.add_transfer' },
  estorno: { Icon: RotateCcw, color: '#10b981', labelKey: 'minhasfinancas.add_estorno' },
};

/** Menu completo: FAB global e botão da tela de Lançamentos. */
export const MF_ADD_ALL = ['expense', 'cardExpense', 'income', 'transfer'];

/** FAB do módulo: além dos lançamentos, cria uma conta direto. */
export const MF_ADD_FAB = ['account', 'expense', 'cardExpense', 'income', 'transfer'];
