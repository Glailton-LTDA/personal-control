import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Receipt, Eye, Trash2, Plus, Tag, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { confirmToast } from '../../lib/toast';
import { supabase, getSignedUrl } from '../../lib/supabase';
import { mfMutate } from '../../lib/offline/mfOffline';
import {
  useMFAccounts,
  useMFCategories,
  useMFTags,
  useCreateMFTransaction,
  useUpdateMFTransaction,
  useDeleteMFTransaction,
  useInstallmentDelete,
  useDeleteMFFixedSeries,
  useCreateMFTag,
  formatMoney,
  parseMoney,
  maskAmount,
  toISODate,
  addMonthsISO,
  shiftRecurrenceDate,
  cardCycles,
  FIXED_SERIES_COUNT,
  fetchInstallmentSeries,
  installmentHeadId,
  isRecurrentTx,
  formatMonthLabel,
  invoiceCloseForDueMonth,
} from '../../hooks/useMinhasFinancas';
import MFAccountSelect from './MFAccountSelect';
import MFSelect from './MFSelect';
import MFCategorySelect from './MFCategorySelect';
import MFRepeatModal from './MFRepeatModal';
import MFChoiceDialog from './MFChoiceDialog';

/** Atalho de navegação (mesmo evento usado pelo Resumo). */
const goTo = (tab) =>
  window.dispatchEvent(new CustomEvent('set-active-tab', { detail: { tab } }));

/** Sugestão de categoria/tipo por palavra-chave (autocomplete da Fase 3). */
const DEFAULT_MAPPINGS = [
  {
    keywords: ['uber', 'taxi', 'onibus', 'ônibus', 'metro', 'metrô', 'gasolina', 'combustivel', 'combustível'],
    category: 'Transporte',
    type: 'DESPESA',
  },
  {
    keywords: ['mercado', 'supermercado', 'ifood', 'restaurante', 'padaria', 'lanche'],
    category: 'Alimentação',
    type: 'DESPESA',
  },
  { keywords: ['aluguel', 'condominio', 'condomínio'], category: 'Moradia', type: 'DESPESA' },
  {
    keywords: ['luz', 'energia', 'agua', 'água', 'internet', 'telefone'],
    category: 'Serviços',
    type: 'DESPESA',
  },
  {
    keywords: ['academia', 'medico', 'médico', 'farmacia', 'farmácia', 'remedio', 'remédio'],
    category: 'Saúde',
    type: 'DESPESA',
  },
  {
    keywords: ['salario', 'salário', 'freelance', 'recebimento'],
    category: 'Receitas',
    type: 'RECEITA',
  },
];

const emptyForm = {
  type: 'DESPESA',
  description: '',
  amount: '',
  account_id: '',
  category_id: '',
  payment_date: toISODate(new Date()),
  due_date: '',
  effective_date: '',
  status: 'PENDENTE',
  notes: '',
  installments: '1',
  recurrence: 'NONE',
  attachment_path: '',
};

/** Grid de campos da tela (colunas responsivas). */
const screenGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
  gap: '1rem',
};

const TYPE_COLORS = {
  DESPESA: '#ef4444',
  RECEITA: '#10b981',
  TRANSFERENCIA: '#6366f1',
};

/**
 * Tela de criação/edição de lançamento (mf_transactions) — 2ª tela do
 * módulo (substitui o antigo modal). Tipos: receita/despesa com cores
 * próprias (verde/vermelho). Tags: só as selecionadas + seletor
 * expansível com todas e criação de tag nova.
 * Inclui: categoria 2 níveis, 3 datas, status, parcelamento, recorrência,
 * anexo e autocompletar de categoria por palavra-chave.
 */
export default function MFTransacaoScreen({
  tx = null,
  user,
  onClose,
  defaultAccountId = null,
  /** Tipo pré-selecionado na criação ('DESPESA' | 'RECEITA'). */
  defaultType = 'DESPESA',
  /**
   * Escopo do seletor de conta na criação: 'all' (tela global),
   * 'contas' (sem cartão) ou 'cartao' (só cartões — despesa no
   * cartão e estorno ficam restritos ao cartão).
   */
  accountScope = 'all',
  /**
   * 'estorno' = devolução da operadora: valor digitado positivo gravado
   * negativo, campo Fatura (ciclo do cartão), status fixo PAGO e sem
   * parcelas/recorrência (mesma tela "Novo estorno" do app original).
   */
  mode = 'normal',
}) {
  const { t, i18n } = useTranslation();
  const { data: accounts = [] } = useMFAccounts(user);
  const { data: categories = [] } = useMFCategories(user);
  const { data: tags = [] } = useMFTags(user);
  const createMutation = useCreateMFTransaction();
  const updateMutation = useUpdateMFTransaction();
  const deleteMutation = useDeleteMFTransaction();
  const deleteFixedMutation = useDeleteMFFixedSeries();
  const instDelete = useInstallmentDelete();
  const createTagMutation = useCreateMFTag();
  const [deleteChoice, setDeleteChoice] = useState(null);

  const [form, setForm] = useState(emptyForm);
  const [tagIds, setTagIds] = useState([]);
  const [newTag, setNewTag] = useState('');
  const [tagsOpen, setTagsOpen] = useState(false);
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  // Repetição na criação: 'none' (lançamento único) | 'repeat'
  // (parcelar/repetir, finito) | 'fixed' (fixa mensal até excluir).
  const [repeatMode, setRepeatMode] = useState('none');
  const [repeatConfig, setRepeatConfig] = useState({
    initial: 1,
    count: 2,
    periodicity: 'MONTHLY',
    amountMode: 'parcela',
  });
  const [repeatOpen, setRepeatOpen] = useState(false);
  // Fatura escolhida no picker (despesa de cartão): '' = segue a data.
  const [invoiceChoice, setInvoiceChoice] = useState('');
  // Aviso de fatura fechada (app original): aceite pontual desta tela.
  const [closedWarn, setClosedWarn] = useState(false);
  const warnAccepted = useRef(false);
  // Série que repete mês com mesmo nome: confirma antes de duplicar.
  const [dupeWarn, setDupeWarn] = useState(null);
  const dupeAccepted = useRef(false);

  const isEdit = !!tx;
  const isEstorno = mode === 'estorno' && !isEdit;

  useEffect(() => {
    setNewTag('');
    setTagsOpen(false);
    setCategoryTouched(false);
    setRepeatMode('none');
    setRepeatConfig({ initial: 1, count: 2, periodicity: 'MONTHLY', amountMode: 'parcela' });
    setRepeatOpen(false);
    setInvoiceChoice(tx?.invoice_close ?? '');
    setClosedWarn(false);
    warnAccepted.current = false;
    setDupeWarn(null);
    dupeAccepted.current = false;
    if (tx) {
      setForm({
        type: tx.type ?? 'DESPESA',
        description: tx.description ?? '',
        amount: tx.amount != null ? (Math.abs(Number(tx.amount)) || 0).toFixed(2).replace('.', ',') : '',
        account_id: tx.account_id ?? '',
        category_id: tx.category_id ?? '',
        payment_date: tx.payment_date ?? toISODate(new Date()),
        due_date: tx.due_date ?? '',
        effective_date: tx.effective_date ?? '',
        status: tx.status ?? 'PENDENTE',
        notes: tx.notes ?? '',
        installments: '1',
        recurrence: 'NONE',
        attachment_path: tx.attachment_path ?? '',
      });
      // tags vinculadas (carregadas pela tela e passadas via tx.tagIds)
      setTagIds(Array.isArray(tx.tagIds) ? tx.tagIds : []);
    } else {
      setForm({
        ...emptyForm,
        type: defaultType,
        payment_date: toISODate(new Date()),
        account_id: defaultAccountId || '',
        status: mode === 'estorno' ? 'PAGO' : emptyForm.status,
      });
      setTagIds([]);
    }
  }, [tx, defaultAccountId, defaultType, mode]);

  // Avisa o container (MinhasFinancas) que a 2ª tela está aberta — o FAB
  // "+" global some enquanto isso (e volta ao fechar).
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('mf-tx-screen', { detail: { open: true } }));
    return () => {
      window.dispatchEvent(new CustomEvent('mf-tx-screen', { detail: { open: false } }));
    };
  }, []);

  // Estorno: pré-seleciona a categoria "Estornos" (Cartões de crédito ›
  // Estornos) quando existir — default do app original.
  useEffect(() => {
    if (!isEstorno || tx) return;
    setForm((prev) => {
      if (prev.category_id) return prev;
      const found = categories.find(
        (cat) =>
          !cat.is_archived &&
          (cat.type === 'DESPESA' || cat.type === 'AMBAS') &&
          /^estorno/i.test(String(cat.name || '').trim())
      );
      return found ? { ...prev, category_id: found.id } : prev;
    });
  }, [isEstorno, tx, categories]);

  // Contas do escopo: 'contas' esconde cartões, 'cartao' só cartões.
  const scopedAccounts = useMemo(() => {
    if (accountScope === 'cartao') return accounts.filter((account) => account.account_type === 'CARTAO');
    if (accountScope === 'contas') return accounts.filter((account) => account.account_type !== 'CARTAO');
    return accounts;
  }, [accounts, accountScope]);

  // Conta padrão na criação: respeita o escopo (um cartão só já vem
  // selecionado no "Despesa cartão") e mantém a conta pré-preenchida
  // quando os dados ainda não carregaram.
  useEffect(() => {
    if (tx || scopedAccounts.length === 0) return;
    setForm((prev) => {
      if (prev.account_id && scopedAccounts.some((account) => account.id === prev.account_id)) {
        return prev;
      }
      const firstActive = scopedAccounts.find((account) => !account.archived_at);
      return firstActive ? { ...prev, account_id: firstActive.id } : prev;
    });
  }, [tx, scopedAccounts]);

  const set = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));

  // Contas visíveis no seletor (ativas do escopo + a conta arquivada do
  // lançamento em edição)
  const visibleAccounts = useMemo(
    () =>
      scopedAccounts.filter(
        (account) => !account.archived_at || account.id === form.account_id
      ),
    [scopedAccounts, form.account_id]
  );

  // Categorias válidas para o tipo (2 níveis, sem arquivadas)
  const visibleCategories = useMemo(() => {
    const byType = categories.filter(
      (cat) => !cat.is_archived && (cat.type === form.type || cat.type === 'AMBAS')
    );
    const parents = byType.filter((cat) => !cat.parent_id);
    const ordered = [];
    parents.forEach((parent) => {
      ordered.push(parent);
      byType
        .filter((cat) => cat.parent_id === parent.id)
        .forEach((child) => ordered.push(child));
    });
    // órfãs (pai arquivado/inexistente)
    byType
      .filter((cat) => cat.parent_id && !parents.some((p) => p.id === cat.parent_id))
      .forEach((cat) => ordered.push(cat));
    return ordered;
  }, [categories, form.type]);

  // Troca de tipo limpa categoria incompatível
  useEffect(() => {
    if (form.category_id && !visibleCategories.some((cat) => cat.id === form.category_id)) {
      setForm((prev) => ({ ...prev, category_id: '' }));
    }
  }, [visibleCategories, form.category_id]);

  // Estorno: cartão escolhido + ciclos de fatura (mesma régua do
  // buildCardInvoices) para o campo "Fatura".
  const invoiceCard = useMemo(
    () =>
      isEstorno && form.account_id
        ? accounts.find(
            (row) => row.id === form.account_id && row.account_type === 'CARTAO'
          )
        : null,
    [isEstorno, form.account_id, accounts]
  );
  const invoiceCycles = useMemo(
    () =>
      invoiceCard
        ? cardCycles(invoiceCard, form.payment_date || toISODate(new Date()), 6)
        : [],
    [invoiceCard, form.payment_date]
  );
  /** Ciclo que contém a data de lançamento (menor fechamento ≥ data). */
  const invoiceClose = useMemo(() => {
    if (invoiceCycles.length === 0) return '';
    const day = form.payment_date || toISODate(new Date());
    const containing = invoiceCycles
      .filter((cycle) => cycle.closeISO >= day)
      .slice(-1)[0];
    return containing?.closeISO ?? invoiceCycles[invoiceCycles.length - 1].closeISO;
  }, [invoiceCycles, form.payment_date]);

  // Rótulo do picker de fatura no padrão do app original ("Outubro, 2026"):
  // só mês + ano do vencimento — mais fácil de ler que período/vencimento.
  const invoiceMonthYear = (iso) => {
    if (!iso) return '—';
    const [y, m] = iso.split('-').map(Number);
    try {
      const month = new Intl.DateTimeFormat(i18n.language, { month: 'long' }).format(
        new Date(y, m - 1, 1)
      );
      return `${month.charAt(0).toUpperCase() + month.slice(1)}, ${y}`;
    } catch {
      return `${String(m).padStart(2, '0')}/${y}`;
    }
  };

  // Despesa de cartão (app original não tem status: entra sempre paga e
  // consome o limite na hora).
  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === form.account_id) ?? null,
    [accounts, form.account_id]
  );
  const isCardExpense =
    form.type === 'DESPESA' && selectedAccount?.account_type === 'CARTAO' && !isEstorno;
  // Repetição na edição: só some se o lançamento já for recorrente
  // (fixa, com recorrência ou parte de parcelado).
  const alreadyRecurrent = isEdit && isRecurrentTx(tx);

  // Fatura da despesa de cartão (~2 anos: treze meses para trás + doze
  // para frente, "Mês · Vence dd/mm/aa"). O membro da fatura é a ESCOLHA
  // no picker (`invoice_close`); a data é só rótulo exibido. Default =
  // fatura do mês (do lançamento): em outubro, 05/10 e 12/10 caem em
  // "Outubro" salvo escolha explícita.
  const expenseCycles = useMemo(() => {
    if (!isCardExpense || !selectedAccount) return [];
    return cardCycles(selectedAccount, toISODate(new Date()), 13, 12)
      .slice()
      .sort((a, b) => a.closeISO.localeCompare(b.closeISO));
  }, [isCardExpense, selectedAccount]);
  /** Default: fatura que vence no mês do lançamento (mês calendário). */
  const naturalExpenseClose = useMemo(() => {
    if (!isCardExpense || !selectedAccount) return '';
    const day = form.payment_date || toISODate(new Date());
    return invoiceCloseForDueMonth(selectedAccount, day.slice(0, 7));
  }, [isCardExpense, selectedAccount, form.payment_date]);
  const expenseInvoiceClose = invoiceChoice || naturalExpenseClose;
  /** "setembro/2026" para o aviso de fatura fechada (texto do original).
      Mês do vencimento, como no picker. */
  const closedWarnMonth = useMemo(() => {
    const dueISO = expenseCycles.find((cycle) => cycle.closeISO === expenseInvoiceClose)?.dueISO;
    const iso = dueISO || expenseInvoiceClose;
    if (!iso) return '';
    const label = formatMonthLabel(iso.slice(0, 7), i18n.language);
    return label.charAt(0).toLowerCase() + label.slice(1).replace(' de ', '/').replace(' ', '/');
  }, [expenseInvoiceClose, expenseCycles, i18n.language]);

  // Despesa de cartão entra sempre paga (sem status, como no original).
  useEffect(() => {
    if (isCardExpense) {
      setForm((prev) => (prev.status === 'PAGO' ? prev : { ...prev, status: 'PAGO' }));
    }
  }, [isCardExpense]);

  /**
   * Escolher uma fatura NÃO move a data: a data é só rótulo exibido
   * ("12/10/2026 - segunda" dentro da fatura de novembro, se escolhida).
   * O membro da fatura é a escolha (`invoice_close`).
   */
  const pickInvoice = (closeISO) => {
    setInvoiceChoice(closeISO);
  };

  const handleDescriptionChange = (event) => {
    const value = event.target.value;
    setForm((prev) => {
      const next = { ...prev, description: value };
      if (categoryTouched || prev.category_id) return next;
      const lower = value.toLowerCase();
      const match = DEFAULT_MAPPINGS.find((mapping) =>
        mapping.keywords.some((kw) => lower.includes(kw))
      );
      if (!match) return next;
      const suggested = categories.find(
        (cat) =>
          cat.name.toLowerCase() === match.category.toLowerCase() &&
          !cat.is_archived &&
          (cat.type === match.type || cat.type === 'AMBAS')
      );
      if (suggested) {
        next.type = match.type;
        next.category_id = suggested.id;
      }
      return next;
    });
  };

  const handleToggleTag = (tagId) => {
    setTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  const handleAddTag = async () => {
    const name = newTag.trim();
    if (!name) return;
    if (tags.some((tag) => tag.name.toLowerCase() === name.toLowerCase())) {
      toast.error(t('minhasfinancas.tx_tag_exists'));
      return;
    }
    try {
      const created = await createTagMutation.mutateAsync({ user_id: user.id, name });
      if (created?.id) setTagIds((prev) => [...prev, created.id]);
      setNewTag('');
    } catch {
      toast.error(t('minhasfinancas.save_error'));
    }
  };

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('mf-attachments').upload(path, file);
      if (error) throw error;
      setForm((prev) => ({ ...prev, attachment_path: path }));
    } catch {
      toast.error(t('minhasfinancas.tx_upload_error'));
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  const handleViewAttachment = async () => {
    const url = await getSignedUrl('mf-attachments', form.attachment_path);
    if (url) window.open(url, '_blank');
  };

  const linkTags = async (transactionIds) => {
    if (transactionIds.length === 0) return;
    if (isEdit) {
      // Vínculos da transação: apaga todos e recria (offline: Dexie + fila).
      await mfMutate({
        table: 'mf_transaction_tags',
        action: 'deleteLinks',
        ids: [tx.id],
        run: async () => {
          const { error } = await supabase
            .from('mf_transaction_tags')
            .delete()
            .eq('transaction_id', tx.id);
          if (error) throw error;
          return [tx.id];
        },
      });
    }
    if (tagIds.length === 0) return;
    const rows = transactionIds.flatMap((transactionId) =>
      tagIds.map((tagId) => ({ transaction_id: transactionId, tag_id: tagId, user_id: user.id }))
    );
    await mfMutate({
      table: 'mf_transaction_tags',
      action: 'insert',
      payload: rows,
      run: async () => {
        const { error } = await supabase.from('mf_transaction_tags').insert(rows);
        if (error) throw error;
        return rows;
      },
    });
  };

  /** Excluir o lançamento em edição (com confirmação; vínculos de tag caem juntos). */
  const singleDelete = () => {
    confirmToast(
      t('minhasfinancas.tx_delete_confirm', { name: form.description || tx.description }),
      async () => {
        try {
          await deleteMutation.mutateAsync(tx.id);
          toast.success(t('minhasfinancas.tx_deleted'));
          onClose();
        } catch {
          toast.error(t('minhasfinancas.save_error'));
        }
      },
      { danger: true, confirmText: t('minhasfinancas.delete') }
    );
  };

  const handleDelete = async () => {
    if (!tx?.id) return;
    // Série fixa: escopo (este mês / daqui em diante / tudo).
    if (tx.is_fixed) {
      setDeleteChoice({ kind: 'fixed' });
      return;
    }
    // Série parcelada: escopo (só esta / esta e próximas / todas).
    if (installmentHeadId(tx)) {
      try {
        const series = await fetchInstallmentSeries(tx);
        if (series.length > 1) {
          setDeleteChoice({ kind: 'inst' });
          return;
        }
      } catch {
        toast.error(t('minhasfinancas.save_error'));
        return;
      }
    }
    singleDelete();
  };

  /** Executa a exclusão com escopo escolhida no diálogo (fecha a tela se o aberto saiu). */
  const runScopedDelete = async ({ kind, key, renumber }) => {
    setDeleteChoice(null);
    try {
      if (kind === 'fixed') {
        await deleteFixedMutation.mutateAsync({ tx, mode: key });
      } else {
        const { deletedIds } = await instDelete({ tx, scope: key, renumber });
        if (!deletedIds.includes(tx.id)) return;
      }
      toast.success(t('minhasfinancas.tx_deleted'));
      onClose();
    } catch {
      toast.error(t('minhasfinancas.save_error'));
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.description.trim()) {
      toast.error(t('minhasfinancas.tx_desc_required'));
      return;
    }
    const amount = parseMoney(form.amount);
    if (!(amount > 0)) {
      toast.error(t('minhasfinancas.tx_amount_required'));
      return;
    }
    if (!form.account_id) {
      toast.error(t('minhasfinancas.tx_account_required'));
      return;
    }
    if (!form.payment_date) {
      toast.error(t('minhasfinancas.tx_date_required'));
      return;
    }

    // Fatura fechada: salvar despesa de cartão numa fatura mais antiga
    // que a do mês (vencimento anterior ao mês atual) pede confirmação
    // ("Fatura fechada!"). A corrente nunca avisa (é o default).
    const chosenDueMonth = expenseCycles.find(
      (cycle) => cycle.closeISO === expenseInvoiceClose
    )?.dueISO?.slice(0, 7);
    if (
      isCardExpense &&
      expenseInvoiceClose &&
      chosenDueMonth &&
      chosenDueMonth < toISODate(new Date()).slice(0, 7) &&
      !warnAccepted.current &&
      localStorage.getItem('mf_closed_invoice_warn_off') !== '1'
    ) {
      setClosedWarn(true);
      return;
    }

    // preserva sinal de estornos/reembolsos já lançados com valor negativo;
    // no modo estorno o valor digitado é positivo (devolução da operadora)
    // e é gravado negativo — é ele que reduz a fatura.
    const sign = isEdit
      ? Number(tx.amount) < 0
        ? -1
        : 1
      : isEstorno
        ? -1
        : 1;
    // Na edição, repetir só converte quem ainda não é recorrente.
    const converting = isEdit && repeatMode !== 'none' && !alreadyRecurrent;
    // Parcelado "Valor total": o digitado é dividido entre as parcelas;
    // "Valor parcela" (padrão): cada parcela tem o valor digitado.
    const each =
      repeatMode === 'repeat' &&
      repeatConfig.amountMode === 'total' &&
      repeatConfig.count > 0 &&
      (!isEdit || converting)
        ? Math.round((amount / repeatConfig.count) * 100) / 100
        : amount;
    const base = {
      user_id: user.id,
      account_id: form.account_id,
      type: isEstorno ? 'DESPESA' : form.type,
      description: form.description.trim(),
      amount: each * sign,
      payment_date: form.payment_date,
      // Despesa de cartão: só data de lançamento + fatura (sem vencimento).
      due_date: isCardExpense ? null : form.due_date || null,
      effective_date:
        form.effective_date || (form.status === 'PAGO' ? form.payment_date : null),
      status: isCardExpense || isEstorno ? 'PAGO' : form.status,
      category_id: form.category_id || null,
      notes: form.notes.trim() || null,
      attachment_path: form.attachment_path || null,
      // Despesa de cartão: fatura escolhida no picker (sempre gravada —
      // a fatura independe da data, como no app original).
      ...(isCardExpense ? { invoice_close: expenseInvoiceClose || null } : {}),
    };

    // Série que repete mês com mesmo nome (fixa/parcelada/repetida):
    // confirma antes de duplicar (ex.: fixa criada sobre mês importado).
    const createsSeries =
      (!isEdit && (repeatMode === 'fixed' || repeatMode === 'repeat')) || converting;
    if (createsSeries && !dupeAccepted.current) {
      const plannedDates =
        repeatMode === 'fixed'
          ? Array.from({ length: FIXED_SERIES_COUNT }, (_, i) => addMonthsISO(base.payment_date, i))
          : repeatMode === 'repeat' && repeatConfig.periodicity === 'MONTHLY'
            ? Array.from({ length: repeatConfig.count }, (_, i) => addMonthsISO(base.payment_date, i))
            : repeatMode === 'repeat'
              ? Array.from({ length: repeatConfig.count }, (_, i) =>
                  shiftRecurrenceDate(base.payment_date, repeatConfig.periodicity, i)
                )
              : [];
      if (plannedDates.length > 0) {
        try {
          const from = `${plannedDates[0].slice(0, 7)}-01`;
          const lastPlanned = plannedDates[plannedDates.length - 1];
          const to = `${lastPlanned.slice(0, 7)}-31`;
          const { data, error } = await supabase
            .from('mf_transactions')
            .select('id,description,payment_date,status')
            .eq('account_id', form.account_id)
            .eq('type', isEstorno ? 'DESPESA' : form.type)
            .gte('payment_date', from)
            .lte('payment_date', to);
          if (!error) {
            const want = base.description.trim().toLowerCase();
            const plannedMonths = new Set(plannedDates.map((iso) => iso.slice(0, 7)));
            const hitMonths = [...new Set(
              (data ?? [])
                .filter(
                  (row) =>
                    row.id !== tx?.id &&
                    row.status !== 'CANCELADO' &&
                    String(row.description ?? '').trim().toLowerCase() === want &&
                    plannedMonths.has(String(row.payment_date ?? '').slice(0, 7))
                )
                .map((row) => String(row.payment_date).slice(0, 7))
            )].sort();
            if (hitMonths.length > 0) {
              setDupeWarn({ months: hitMonths });
              return;
            }
          }
        } catch {
          /* offline: segue sem checar */
        }
      }
    }

    setSaving(true);
    try {
      if (isEdit && !converting) {
        await updateMutation.mutateAsync({ id: tx.id, ...base });
        await linkTags([tx.id]);
        toast.success(t('minhasfinancas.tx_updated'));
        onClose();
        return;
      }

      const createdIds = [];
      // Cabeça: cria — ou atualiza o lançamento em edição ao converter
      // um avulso em série (ele vira a cabeça, com as filhas vinculadas).
      const saveHead = async (extra) => {
        if (isEdit) {
          await updateMutation.mutateAsync({ id: tx.id, ...base, ...extra });
          return tx.id;
        }
        const [first] = await createMutation.mutateAsync({ ...base, ...extra });
        createdIds.push(first?.id);
        return first?.id ?? null;
      };
      const saveChildren = async (rows) => {
        if (rows.length === 0) return;
        const created = await createMutation.mutateAsync(rows);
        created.forEach((row) => createdIds.push(row?.id));
      };
      // Filhas: despesa de cartão entra paga; cada filha leva a fatura
      // do seu mês (vencimento = mês do lançamento) — a data é só rótulo.
      // Nas demais contas, futura segue pendente e sem vínculo.
      const childBase = (over) => ({
        ...base,
        ...over,
        ...(isCardExpense && over.payment_date && selectedAccount
          ? { invoice_close: invoiceCloseForDueMonth(selectedAccount, over.payment_date.slice(0, 7)) }
          : { invoice_close: null }),
        status: isCardExpense ? 'PAGO' : 'PENDENTE',
        effective_date: isCardExpense ? over.payment_date : null,
      });

      if (repeatMode === 'fixed') {
        // Série fixa mensal: 12 ocorrências agora; o estensor (1x/dia)
        // mantém ~12 meses futuros até o usuário excluir a série.
        const headId = await saveHead({ recurrence: 'MONTHLY', is_fixed: true });
        const children = [];
        for (let i = 1; i < FIXED_SERIES_COUNT; i += 1) {
          children.push(
            childBase({
              payment_date: addMonthsISO(base.payment_date, i),
              due_date: base.due_date ? addMonthsISO(base.due_date, i) : null,
              recurrence: 'MONTHLY',
              is_fixed: true,
              parent_transaction_id: headId,
            })
          );
        }
        await saveChildren(children);
      } else if (repeatMode === 'repeat' && repeatConfig.periodicity === 'MONTHLY') {
        // Parcelamento numerado (1/12…) — série finita mensal.
        const { initial, count } = repeatConfig;
        const total = initial + count - 1;
        const headId = await saveHead({
          recurrence: 'NONE',
          installments_current: initial,
          installments_total: total,
        });
        const children = [];
        for (let i = 1; i < count; i += 1) {
          children.push(
            childBase({
              payment_date: addMonthsISO(base.payment_date, i),
              due_date: base.due_date ? addMonthsISO(base.due_date, i) : null,
              recurrence: 'NONE',
              installments_current: initial + i,
              installments_total: total,
              parent_transaction_id: headId,
            })
          );
        }
        await saveChildren(children);
      } else if (repeatMode === 'repeat') {
        // Repetição finita semanal/anual (sem numeração de parcela).
        const { count, periodicity } = repeatConfig;
        const headId = await saveHead({ recurrence: periodicity });
        const children = [];
        for (let i = 1; i < count; i += 1) {
          children.push(
            childBase({
              payment_date: shiftRecurrenceDate(base.payment_date, periodicity, i),
              due_date: base.due_date
                ? shiftRecurrenceDate(base.due_date, periodicity, i)
                : null,
              recurrence: periodicity,
              parent_transaction_id: headId,
            })
          );
        }
        await saveChildren(children);
      } else {
        await saveHead({ recurrence: 'NONE' });
      }

      await linkTags(isEdit ? [tx.id, ...createdIds.filter(Boolean)] : createdIds.filter(Boolean));
      toast.success(t(isEdit ? 'minhasfinancas.tx_updated' : 'minhasfinancas.tx_saved'));
      onClose();
    } catch {
      toast.error(t('minhasfinancas.save_error'));
    } finally {
      setSaving(false);
    }
  };

  const selectedTags = tagIds
    .map((id) => tags.find((tag) => tag.id === id))
    .filter(Boolean);

  /**
   * Selo fixo do tipo no cabeçalho: o tipo é escolhido no menu "+" (ou já vem
   * do lançamento em edição) — não há abas para trocar dentro da tela.
   */
  const typeBadgeKey = isEstorno
    ? 'minhasfinancas.add_estorno'
    : form.type === 'RECEITA'
      ? 'minhasfinancas.add_income'
      : form.type === 'TRANSFERENCIA'
        ? 'minhasfinancas.add_transfer'
        : accountScope === 'cartao'
          ? 'minhasfinancas.add_card_expense'
          : 'minhasfinancas.add_expense';

  const typeBadgeColor = TYPE_COLORS[form.type] || 'var(--primary)';
  const typeBadgeStyle = {
    fontSize: '0.72rem',
    fontWeight: 800,
    letterSpacing: '0.03em',
    textTransform: 'uppercase',
    padding: '0.25rem 0.65rem',
    borderRadius: 999,
    whiteSpace: 'nowrap',
    color: typeBadgeColor,
    background: `color-mix(in srgb, ${typeBadgeColor} 16%, transparent)`,
    border: `1px solid ${typeBadgeColor}`,
  };

  const tagChipStyle = (tag, active) => ({
    fontSize: '0.75rem',
    fontWeight: 700,
    padding: '0.25rem 0.65rem',
    borderRadius: 999,
    cursor: 'pointer',
    border: '1px solid var(--glass-border)',
    background: active ? tag.color || 'var(--primary)' : 'transparent',
    color: active ? '#fff' : 'var(--text-muted)',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.3rem',
  });

  return createPortal(
    <div className="modal-overlay" data-testid="mf-tx-screen" onClick={onClose}>
      <div
        className="glass-card modal-content"
        onClick={(event) => event.stopPropagation()}
        style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: 820 }}
      >
      {/* Cabeçalho — mesmo padrão do modal de conta (ícone+título à esquerda, X à direita) */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
          <div
            style={{
              padding: '0.6rem',
              borderRadius: 14,
              background: 'color-mix(in srgb, var(--primary) 14%, transparent)',
              color: 'var(--primary)',
            }}
          >
            <Receipt size={22} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}
            >
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>
                {t(
                  isEdit
                    ? 'minhasfinancas.tx_title_edit'
                    : isEstorno
                      ? 'minhasfinancas.tx_title_estorno'
                      : 'minhasfinancas.tx_title_new'
                )}
              </h3>
              {/* Selo do tipo: escolhido no menu "+" (ou fixo na edição) — sem abas */}
              <span data-testid="mf-tx-type-badge" style={typeBadgeStyle}>
                {t(typeBadgeKey)}
              </span>
            </div>
            <p
              style={{
                margin: '0.2rem 0 0',
                fontSize: '0.85rem',
                color: 'var(--text-muted)',
              }}
            >
              {t('minhasfinancas.tx_form_desc')}
              {isEdit && tx?.installments_total
                ? ` · ${t('minhasfinancas.tx_installment_of', {
                    current: tx.installments_current,
                    total: tx.installments_total,
                  })}`
                : ''}
            </p>
          </div>
        </div>
        <button
          type="button"
          className="icon-btn"
          data-testid="mf-tx-back"
          aria-label={t('minhasfinancas.close')}
          title={t('minhasfinancas.close')}
          onClick={onClose}
        >
          <X size={22} />
        </button>
      </div>

      <form onSubmit={handleSubmit} data-testid="mf-tx-form">
        {/* Descrição (largura total) */}
        <div className="input-group" style={{ marginBottom: '1rem' }}>
          <label>{t('minhasfinancas.tx_description_label')}</label>
          <input
            type="text"
            required
            value={form.description}
            onChange={handleDescriptionChange}
            placeholder={t('minhasfinancas.tx_description_placeholder')}
            data-testid="mf-tx-description"
          />
        </div>

        {/* Valor / Conta / Categoria / Status */}
        <div style={{ ...screenGrid, marginBottom: '1rem' }}>
          <div className="input-group">
            <label>{t('minhasfinancas.tx_amount_label')}</label>
            <input
              type="text"
              inputMode="numeric"
              value={form.amount}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, amount: maskAmount(event.target.value) }))
              }
              placeholder="0,00"
              data-testid="mf-tx-amount"
            />
          </div>
          <div className="input-group">
            <label>{t('minhasfinancas.tx_account_label')}</label>
            <MFAccountSelect
              value={form.account_id}
              onChange={(id) => setForm((prev) => ({ ...prev, account_id: id }))}
              accounts={visibleAccounts}
              placeholder={t('minhasfinancas.tx_account_placeholder')}
              testId="mf-tx-account"
            />
          </div>
          <div className="input-group">
            <label>{t('minhasfinancas.tx_category_label')}</label>
            <MFCategorySelect
              testId="mf-tx-category"
              value={form.category_id}
              onChange={(next) => {
                setCategoryTouched(true);
                setForm((prev) => ({ ...prev, category_id: next }));
              }}
              categories={visibleCategories}
              placeholder={t('minhasfinancas.tx_category_none')}
            />
            {categories.length === 0 && (
              <p
                style={{ margin: '0.4rem 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}
              >
                {t('minhasfinancas.tx_no_categories')}{' '}
                <button
                  type="button"
                  onClick={() => goTo('minhasfinancas-settings')}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    color: 'var(--primary)',
                    cursor: 'pointer',
                    font: 'inherit',
                    textDecoration: 'underline',
                  }}
                >
                  {t('minhasfinancas.tx_go_settings')}
                </button>
              </p>
            )}
          </div>
          {!isEstorno && !isCardExpense && (
            <div className="input-group">
              <label>{t('minhasfinancas.tx_status_label')}</label>
              <MFSelect
                testId="mf-tx-status"
                value={form.status}
                onChange={(next) => set('status')({ target: { value: next } })}
                searchable={false}
                options={[
                  { value: 'PENDENTE', label: t('minhasfinancas.status_pendente') },
                  { value: 'PAGO', label: t('minhasfinancas.status_pago') },
                ]}
              />
            </div>
          )}
        </div>

        {/* Datas (+ Fatura no estorno e na despesa de cartão) */}
        <div style={{ ...screenGrid, marginBottom: '1rem' }}>
          {isEstorno && invoiceCycles.length > 0 && (
            <div className="input-group">
              <label>{t('minhasfinancas.tx_invoice_label')}</label>
              <MFSelect
                testId="mf-tx-invoice"
                value={invoiceClose}
                onChange={pickInvoice}
                searchable={false}
                options={invoiceCycles.map((cycle) => ({
                  value: cycle.closeISO,
                  label: invoiceMonthYear(cycle.dueISO),
                }))}
              />
            </div>
          )}
          {/* Fatura da despesa de cartão (picker do app original, ~2 anos):
              em qual fatura o lançamento cai, independente da data. */}
          {isCardExpense && expenseCycles.length > 0 && (
            <div className="input-group">
              <label>{t('minhasfinancas.tx_invoice_label')}</label>
              <MFSelect
                testId="mf-tx-invoice"
                value={expenseInvoiceClose}
                onChange={(closeISO) => setInvoiceChoice(closeISO)}
                searchable={false}
                options={expenseCycles.map((cycle) => ({
                  value: cycle.closeISO,
                  label: invoiceMonthYear(cycle.dueISO),
                }))}
              />
            </div>
          )}
          {/* Despesa de cartão (app original): só Data de lançamento + Fatura */}
          {isCardExpense ? (
            <div className="input-group">
              <label>{t('minhasfinancas.tx_launch_date')}</label>
              <input
                type="date"
                value={form.payment_date}
                onChange={set('payment_date')}
                data-testid="mf-tx-payment-date"
              />
            </div>
          ) : (
            <>
              <div className="input-group">
                <label>{t('minhasfinancas.tx_date_payment')}</label>
                <input
                  type="date"
                  value={form.payment_date}
                  onChange={set('payment_date')}
                  data-testid="mf-tx-payment-date"
                />
              </div>
              <div className="input-group">
                <label>{t('minhasfinancas.tx_date_due')}</label>
                <input
                  type="date"
                  value={form.due_date}
                  onChange={set('due_date')}
                  data-testid="mf-tx-due-date"
                />
              </div>
              <div className="input-group">
                <label>{t('minhasfinancas.tx_date_effective')}</label>
                <input
                  type="date"
                  value={form.effective_date}
                  onChange={set('effective_date')}
                  data-testid="mf-tx-effective-date"
                />
              </div>
            </>
          )}
        </div>

        {/* Repetição (nunca em estorno; na edição, só se ainda não é
            recorrente) — 3 opções: Não recorrente | Parcelar ou repetir
            | Fixa mensal */}
        {!isEstorno && !alreadyRecurrent && (
          <div className="input-group" style={{ marginBottom: '1rem' }} data-testid="mf-tx-repeat">
            <label>{t('minhasfinancas.tx_repeat_label')}</label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className={repeatMode === 'none' ? 'btn-secondary' : 'btn-cancel'}
                data-testid="mf-tx-repeat-none"
                aria-pressed={repeatMode === 'none'}
                onClick={() => setRepeatMode('none')}
              >
                {t('minhasfinancas.tx_repeat_none')}
              </button>
              <button
                type="button"
                className={repeatMode === 'repeat' ? 'btn-secondary' : 'btn-cancel'}
                data-testid="mf-tx-repeat-open"
                aria-pressed={repeatMode === 'repeat'}
                onClick={() => setRepeatOpen(true)}
              >
                {t('minhasfinancas.tx_repeat_open')}
              </button>
              <button
                type="button"
                className={repeatMode === 'fixed' ? 'btn-secondary' : 'btn-cancel'}
                data-testid="mf-tx-repeat-fixed"
                aria-pressed={repeatMode === 'fixed'}
                onClick={() => setRepeatMode('fixed')}
              >
                {t('minhasfinancas.tx_repeat_fixed')}
              </button>
            </div>
            {repeatMode === 'repeat' && (
              <p
                data-testid="mf-tx-repeat-summary"
                style={{ margin: '0.55rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}
              >
                {t('minhasfinancas.tx_repeat_summary', {
                  count: repeatConfig.count,
                  amount: formatMoney(
                    repeatConfig.amountMode === 'total' && repeatConfig.count > 0
                      ? Math.round((parseMoney(form.amount) / repeatConfig.count) * 100) / 100
                      : parseMoney(form.amount),
                    accounts.find((acc) => acc.id === form.account_id)?.currency || 'BRL'
                  ),
                  periodicity: t(
                    `minhasfinancas.tx_recurrence_${repeatConfig.periodicity.toLowerCase()}`
                  ),
                })}
              </p>
            )}
            {repeatMode === 'fixed' && (
              <p
                data-testid="mf-tx-repeat-hint"
                style={{ margin: '0.55rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}
              >
                {t('minhasfinancas.tx_fixed_hint')}
              </p>
            )}
          </div>
        )}
        {repeatOpen && !isEstorno && !alreadyRecurrent && (
          <MFRepeatModal
            initial={repeatConfig.initial}
            count={repeatConfig.count}
            periodicity={repeatConfig.periodicity}
            amountMode={repeatConfig.amountMode}
            amount={parseMoney(form.amount)}
            currency={
              accounts.find((acc) => acc.id === form.account_id)?.currency || 'BRL'
            }
            onApply={(next) => {
              setRepeatConfig(next);
              setRepeatMode('repeat');
              setRepeatOpen(false);
            }}
            onClose={() => setRepeatOpen(false)}
          />
        )}

        {/* Fatura fechada (app original): confirma antes de salvar nela. */}
        {closedWarn && (
          <MFChoiceDialog
            testId="mf-tx-closed-invoice"
            title={t('minhasfinancas.inv_closed_title')}
            body={t('minhasfinancas.inv_closed_body', { month: closedWarnMonth })}
            checkbox={{
              label: t('minhasfinancas.inv_closed_no_warn'),
              testId: 'mf-tx-closed-check',
              defaultChecked: false,
            }}
            options={[
              { key: 'cancel', label: t('minhasfinancas.cancel') },
              {
                key: 'continue',
                label: t('minhasfinancas.card_pay_continue'),
                variant: 'primary',
              },
            ]}
            onOption={(key, noWarn) => {
              if (key !== 'continue') {
                setClosedWarn(false);
                return;
              }
              if (noWarn) {
                try {
                  localStorage.setItem('mf_closed_invoice_warn_off', '1');
                } catch {
                  /* armazenamento indisponível */
                }
              }
              warnAccepted.current = true;
              setClosedWarn(false);
              handleSubmit({ preventDefault() {} });
            }}
            onClose={() => setClosedWarn(false)}
          />
        )}

        {/* Série com mesmo nome no mês: confirma antes de duplicar. */}
        {dupeWarn && (
          <MFChoiceDialog
            testId="mf-tx-dupe"
            title={t('minhasfinancas.tx_dupe_title')}
            body={t('minhasfinancas.tx_dupe_body', {
              name: form.description.trim(),
              months: dupeWarn.months
                .map((mk) => formatMonthLabel(mk, i18n.language))
                .join(', '),
            })}
            options={[
              { key: 'cancel', label: t('minhasfinancas.cancel') },
              {
                key: 'continue',
                label: t('minhasfinancas.card_pay_continue'),
                variant: 'primary',
              },
            ]}
            onOption={(key) => {
              if (key !== 'continue') {
                setDupeWarn(null);
                return;
              }
              dupeAccepted.current = true;
              setDupeWarn(null);
              handleSubmit({ preventDefault() {} });
            }}
            onClose={() => setDupeWarn(null)}
          />
        )}

        {/* Exclusão com escopo (série fixa ou parcelada) */}
        {deleteChoice?.kind === 'fixed' && (
          <MFChoiceDialog
            testId="mf-tx-delete-fixed-dialog"
            title={t('minhasfinancas.tx_delete_fixed_title')}
            body={t('minhasfinancas.tx_delete_fixed_body')}
            options={[
              {
                key: 'one',
                label: t('minhasfinancas.tx_delete_fixed_one'),
                testId: 'mf-tx-delete-fixed-one',
              },
              {
                key: 'from',
                label: t('minhasfinancas.tx_delete_fixed_from'),
                testId: 'mf-tx-delete-fixed-from',
              },
              {
                key: 'all',
                label: t('minhasfinancas.tx_delete_fixed_all'),
                testId: 'mf-tx-delete-fixed-all',
              },
            ]}
            onOption={(key) => runScopedDelete({ kind: 'fixed', key })}
            onClose={() => setDeleteChoice(null)}
          />
        )}
        {deleteChoice?.kind === 'inst' && (
          <MFChoiceDialog
            testId="mf-tx-delete-inst-dialog"
            title={t('minhasfinancas.tx_delete_fixed_title')}
            body={t('minhasfinancas.tx_delete_fixed_body')}
            options={[
              {
                key: 'one',
                label: t('minhasfinancas.tx_delete_scope_one'),
                testId: 'mf-tx-delete-inst-one',
              },
              {
                key: 'from',
                label: t('minhasfinancas.tx_delete_scope_from'),
                testId: 'mf-tx-delete-inst-from',
              },
              {
                key: 'all',
                label: t('minhasfinancas.tx_delete_scope_all'),
                testId: 'mf-tx-delete-inst-all',
              },
            ]}
            checkbox={{
              label: t('minhasfinancas.tx_delete_renumber'),
              testId: 'mf-tx-delete-inst-renumber',
            }}
            onOption={(key, renumber) => runScopedDelete({ kind: 'inst', key, renumber })}
            onClose={() => setDeleteChoice(null)}
          />
        )}

        {/* Tags — só as selecionadas + seletor expansível */}
        <div className="input-group" style={{ marginBottom: '1rem' }}>
          <label>{t('minhasfinancas.tx_tags_label')}</label>
          <div
            data-testid="mf-tx-tags-selected"
            style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.55rem' }}
          >
            {selectedTags.length === 0 && (
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {t('minhasfinancas.tx_tags_selected_none')}
              </span>
            )}
            {selectedTags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                data-testid={`mf-tx-tag-sel-${tag.id}`}
                aria-label={t('minhasfinancas.tx_tags_remove')}
                title={t('minhasfinancas.tx_tags_remove')}
                onClick={() => handleToggleTag(tag.id)}
                style={tagChipStyle(tag, true)}
              >
                # {tag.name} <X size={11} aria-hidden />
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn-cancel"
            data-testid="mf-tx-tags-toggle"
            aria-expanded={tagsOpen}
            onClick={() => setTagsOpen((prev) => !prev)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.45rem 0.85rem',
              fontSize: '0.8rem',
            }}
          >
            <Tag size={13} />
            {t('minhasfinancas.tx_tags_add')}
          </button>
          {tagsOpen && (
            <div
              data-testid="mf-tx-tags-picker"
              style={{
                marginTop: '0.6rem',
                padding: '0.8rem',
                border: '1px solid var(--glass-border)',
                borderRadius: 12,
                background: 'rgba(255, 255, 255, 0.02)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.7rem',
              }}
            >
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {tags.length === 0 && (
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {t('minhasfinancas.tx_no_tags')}
                  </span>
                )}
                {tags.map((tag) => {
                  const active = tagIds.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      data-testid={`mf-tx-tag-${tag.id}`}
                      aria-pressed={active}
                      onClick={() => handleToggleTag(tag.id)}
                      style={tagChipStyle(tag, active)}
                    >
                      # {tag.name}
                    </button>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  value={newTag}
                  onChange={(event) => setNewTag(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      handleAddTag();
                    }
                  }}
                  placeholder={t('minhasfinancas.tx_new_tag_placeholder')}
                  data-testid="mf-tx-new-tag"
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="btn-cancel"
                  data-testid="mf-tx-add-tag"
                  onClick={handleAddTag}
                  style={{ padding: '0.5rem 0.8rem' }}
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Observações */}
        <div className="input-group" style={{ marginBottom: '1rem' }}>
          <label>{t('minhasfinancas.tx_notes')}</label>
          <textarea
            value={form.notes}
            onChange={set('notes')}
            rows={3}
            data-testid="mf-tx-notes"
            style={{
              width: '100%',
              background: 'var(--input-bg)',
              border: '1px solid var(--glass-border)',
              borderRadius: 12,
              padding: '0.6rem 0.9rem',
              color: 'var(--text-main)',
              fontFamily: 'inherit',
              fontSize: '0.9rem',
              resize: 'vertical',
            }}
          />
        </div>

        {/* Anexo */}
        <div className="input-group">
          <label>{t('minhasfinancas.tx_attachment')}</label>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={handleFile}
              data-testid="mf-tx-attachment"
              style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}
            />
            {isUploading && (
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {t('minhasfinancas.tx_attachment_uploading')}
              </span>
            )}
            {form.attachment_path && !isUploading && (
              <>
                <button
                  type="button"
                  className="btn-cancel"
                  data-testid="mf-tx-attachment-view"
                  onClick={handleViewAttachment}
                  style={{ padding: '0.4rem 0.7rem', fontSize: '0.8rem' }}
                >
                  <Eye size={13} /> {t('minhasfinancas.tx_attachment_view')}
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  data-testid="mf-tx-attachment-remove"
                  aria-label={t('minhasfinancas.tx_attachment_remove')}
                  onClick={() => setForm((prev) => ({ ...prev, attachment_path: '' }))}
                >
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Ações */}
        <div
          className="modal-footer"
          style={{
            display: 'flex',
            gap: '0.75rem',
            marginTop: '1.5rem',
            paddingTop: '1rem',
            borderTop: '1px solid var(--glass-border)',
            justifyContent: isEdit ? 'space-between' : 'flex-end',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          {isEdit && (
            <button
              type="button"
              data-testid="mf-tx-delete"
              onClick={handleDelete}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                background: 'none',
                border: 'none',
                padding: '0.7rem 0',
                color: 'var(--danger)',
                fontSize: '0.85rem',
                fontWeight: 700,
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              <Trash2 size={14} />
              {t('minhasfinancas.delete')}
            </button>
          )}
          <span style={{ display: 'inline-flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-cancel"
            data-testid="mf-tx-cancel"
            onClick={onClose}
            style={{ padding: '0.7rem 1.5rem' }}
          >
            {t('minhasfinancas.cancel')}
          </button>
          <button
            type="submit"
            className="btn-primary"
            data-testid="mf-tx-save"
            disabled={saving || isUploading}
            style={{ padding: '0.7rem 2.2rem' }}
          >
            {saving ? '…' : t('minhasfinancas.save')}
          </button>
          </span>
        </div>
      </form>
      </div>
    </div>,
    document.body
  );
}
