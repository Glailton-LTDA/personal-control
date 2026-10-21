import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import MFResumo from './MFResumo';
import MFTransacoes from './MFTransacoes';
import MFCartoes from './MFCartoes';
import MFRelatorios from './MFRelatorios';
import MFImportar from './MFImportar';
import MFFelix from './MFFelix';
import MFOrcamentos from './MFOrcamentos';
import MFObjetivos from './MFObjetivos';
import MFConfig from './MFConfig';
import MFContas from './MFContas';
import MFExtrato from './MFExtrato';
import MFPlaceholder from './MFPlaceholder';
import MFSelect from './MFSelect';
import MFAddMenu from './MFAddMenu';
import { MF_ADD_FAB } from './mfAddMenuData';
import MFTransacaoScreen from './MFTransacaoScreen';
import MFTransferModal from './MFTransferModal';
import {
  currentMonthKey,
  useMFProfiles,
  useMFAccounts,
  useMFExtendFixedSeries,
  useMFScheduleCardPayments,
  useMFEffectivateDue,
} from '../../hooks/useMinhasFinancas';
import { MFProfileContext } from '../../hooks/mfProfileContext';
import { SyncEngine } from '../../lib/offline/SyncEngine';
import { readMonthKey, writeMonthKey, requestNewAccount, clearNewAccountRequest } from './mfViewState';

const PROFILE_STORAGE_KEY = 'mf_active_profile';

/**
 * Intervalo mínimo entre dois pulls completos das tabelas mf_* (o
 * download que enche o cache offline do módulo). Entre um pull e outro,
 * abrir o módulo só esvazia a fila de escritas offline — baixar tudo de
 * novo a cada abertura custava uma segunda varredura da tabela de
 * lançamentos por sessão.
 */
const MF_SYNC_INTERVAL_MS = 10 * 60 * 1000;
let lastMfPullAt = 0;

/**
 * Container do módulo "Minhas Finanças".
 * `mode` corresponde à sub-aba ativa (ex.: "minhasfinancas-accounts" -> "accounts").
 * O mês selecionado é compartilhado entre as telas do módulo.
 * Fase 9: perfil ativo (id | null = todos) fica em localStorage e alimenta
 * o `MFProfileContext` consumido pelos hooks de dados.
 */
export default function MinhasFinancas({ user, refreshKey, mode = 'resumo', showValues = true }) {
  const { t } = useTranslation();
  const [key, setKey] = useState(0);
  // Mês sobrevive ao F5 (validado na leitura; drill-down idem, por tela).
  const [monthKey, setMonthKey] = useState(() => readMonthKey(currentMonthKey()));
  useEffect(() => {
    writeMonthKey(monthKey);
  }, [monthKey]);
  // Saiu da aba Contas: descarta pedido pendente de "nova conta" do FAB
  // (senão o modal abriria sozinho numa próxima visita à tela).
  useEffect(() => {
    if (mode !== 'accounts') clearNewAccountRequest();
  }, [mode]);
  const [activeProfile, setActiveProfile] = useState(() => {
    try {
      return localStorage.getItem(PROFILE_STORAGE_KEY) || null;
    } catch {
      return null;
    }
  });
  const { data: profiles = [] } = useMFProfiles(user);
  const { data: accounts = [] } = useMFAccounts(user);
  // Séries fixas: mantém ~12 meses futuros (1x/dia, throttle local).
  useMFExtendFixedSeries(user);
  useMFScheduleCardPayments(user);
  // Efetivação automática (`auto_settle`, default false): promove só o
  // que foi criado com a opção marcada e já vencido (payment_date <= hoje).
  useMFEffectivateDue(user);
  const queryClient = useQueryClient();

  // Menu "+": FAB fixo só do módulo. Some quando há uma 2ª tela aberta
  // (detalhe de conta/cartão ou criação de lançamento) — os eventos são
  // disparados por MFAccountDetail e MFTransacaoScreen.
  const [txScreenOpen, setTxScreenOpen] = useState(false);
  const [detailScope, setDetailScope] = useState(null);
  const [addKind, setAddKind] = useState(null); // 'expense' | 'cardExpense' | 'income'
  const [transferOpen, setTransferOpen] = useState(false);

  useEffect(() => {
    const onTxScreen = (event) => setTxScreenOpen(!!event.detail?.open);
    const onDetail = (event) => setDetailScope(event.detail?.scope ?? null);
    window.addEventListener('mf-tx-screen', onTxScreen);
    window.addEventListener('mf-detail-context', onDetail);
    return () => {
      window.removeEventListener('mf-tx-screen', onTxScreen);
      window.removeEventListener('mf-detail-context', onDetail);
    };
  }, []);

  /** Nova conta troca de aba e pede a tela de Contas abrir o modal. */
  const openNewAccount = () => {
    requestNewAccount();
    window.dispatchEvent(
      new CustomEvent('set-active-tab', { detail: { tab: 'minhasfinancas-accounts' } })
    );
    // Evento para quem JÁ está na aba Contas; se a aba ainda vai montar,
    // o pedido fica pendente e é consumido no mount da tela.
    window.dispatchEvent(new CustomEvent('mf-new-account'));
  };

  /** Transferência abre o modal; os demais tipos abrem a tela de criação. */
  const handleAdd = (kind) => {
    if (kind === 'transfer') {
      setTransferOpen(true);
      return;
    }
    if (kind === 'account') {
      openNewAccount();
      return;
    }
    setAddKind(kind);
  };

  const fabHidden = txScreenOpen || !!detailScope || !!addKind;

  // Fase 9 offline: baixa as tabelas mf_* para o Dexie ao abrir o módulo e
  // invalida as queries quando a sincronização termina (volta da offline).
  // No ambiente de teste o sync roda apenas no mfOffline.test.js (evita
  // pulls em background disputando com os mocks das queries).
  useEffect(() => {
    if (!user?.id || import.meta.env.MODE === 'test') return undefined;
    const engine = new SyncEngine(user.id, { label: 'mf' });
    // O pull completo baixa as tabelas mf_* (e a de lançamentos é grande):
    // ele acontece no máximo uma vez a cada MF_SYNC_INTERVAL_MS por
    // sessão. Entre um pull e outro, o sync só esvazia a fila de escritas
    // offline — sem refazer o download inteiro a cada abertura do módulo.
    const now = Date.now();
    const shouldPull = now - lastMfPullAt >= MF_SYNC_INTERVAL_MS;
    if (shouldPull) lastMfPullAt = now;
    engine.sync({ pull: shouldPull }).catch(() => {});
    // Invalida só as queries do MF (e só quando o pull foi deste módulo):
    // um invalidateQueries() global refazia o fetch de todos os módulos
    // (finance, viagens, música) a cada sincronização — mais uma onda de
    // tráfego no quota de egress.
    const onSynced = (event) => {
      if (event?.detail?.source !== 'mf') return;
      queryClient.invalidateQueries({ queryKey: ['mf'] });
    };
    window.addEventListener('database-synced', onSynced);
    return () => {
      window.removeEventListener('database-synced', onSynced);
      engine.destroy();
    };
  }, [user?.id, queryClient]);

  const persistProfile = (value) => {
    setActiveProfile(value);
    try {
      if (value) localStorage.setItem(PROFILE_STORAGE_KEY, value);
      else localStorage.removeItem(PROFILE_STORAGE_KEY);
    } catch {
      /* storage indisponível — vale só para a sessão */
    }
  };

  // Se o perfil ativo foi excluído, volta para "Todos os perfis".
  useEffect(() => {
    if (activeProfile && profiles.length > 0 && !profiles.some((p) => p.id === activeProfile)) {
      setActiveProfile(null);
      try {
        localStorage.removeItem(PROFILE_STORAGE_KEY);
      } catch {
        /* storage indisponível */
      }
    }
  }, [activeProfile, profiles]);

  useEffect(() => {
    setKey(prev => prev + 1);
  }, [refreshKey, mode]);

  const screenProps = { user, monthKey, onChangeMonth: setMonthKey, showValues };

  return (
    <MFProfileContext.Provider value={activeProfile}>
      <div
        key={key}
        style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, height: '100%' }}
      >
        {/* Trocador de perfil: só aparece quando há perfis cadastrados */}
        {profiles.length > 0 && (
          <div
            data-testid="mf-profile-bar"
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              padding: '0 0 0.75rem',
              flexShrink: 0,
            }}
          >
            <MFSelect
              testId="mf-profile-switch"
              value={activeProfile ?? ''}
              onChange={(next) => persistProfile(next || null)}
              ariaLabel={t('minhasfinancas.pf_section')}
              placeholder={t('minhasfinancas.pf_all')}
              searchable={profiles.length > 5}
              options={[
                { value: '', label: t('minhasfinancas.pf_all') },
                ...profiles.map((profile) => ({ value: profile.id, label: profile.name })),
              ]}
              style={{ width: 'auto', padding: '0.45rem 0.75rem', fontSize: '0.82rem' }}
            />
          </div>
        )}
        {/* FAB "+" do módulo (Nova conta · Despesa · Despesa cartão ·
            Receita · Transferência) — escondido em detalhe/2ª tela */}
        {!fabHidden && (
          <MFAddMenu
            variant="fab"
            items={MF_ADD_FAB}
            onSelect={handleAdd}
            triggerTestId="mf-fab-add"
            testId="mf-fab-menu"
          />
        )}

        {/* Criação a partir do FAB: o próprio modal (portal) cobre a tela */}
        {addKind && (
          <div data-testid="mf-add-overlay" style={{ display: 'contents' }}>
            <MFTransacaoScreen
              user={user}
              defaultType={addKind === 'income' ? 'RECEITA' : 'DESPESA'}
              accountScope={addKind === 'cardExpense' ? 'cartao' : 'contas'}
              invoiceMonthKey={monthKey}
              onClose={() => setAddKind(null)}
            />
          </div>
        )}

        {/* Transferência a partir do FAB (só contas: origem → destino) */}
        <MFTransferModal
          isOpen={transferOpen}
          accounts={accounts.filter(
            (row) => !row.archived_at && row.account_type !== 'CARTAO'
          )}
          user={user}
          onClose={() => setTransferOpen(false)}
        />

        {mode === 'resumo' && <MFResumo {...screenProps} />}
        {mode === 'transactions' && <MFTransacoes {...screenProps} />}
        {mode === 'accounts' && <MFContas {...screenProps} />}
        {mode === 'statement' && <MFExtrato {...screenProps} />}
        {mode === 'cards' && <MFCartoes {...screenProps} />}
        {mode === 'reports' && <MFRelatorios {...screenProps} />}
        {mode === 'import' && <MFImportar {...screenProps} />}
        {mode === 'felix' && <MFFelix {...screenProps} />}
        {mode === 'budgets' && <MFOrcamentos {...screenProps} />}
        {mode === 'goals' && <MFObjetivos {...screenProps} />}
        {mode === 'settings' && <MFConfig {...screenProps} />}
        {!['resumo', 'transactions', 'accounts', 'statement', 'cards', 'reports', 'import', 'felix', 'budgets', 'goals', 'settings'].includes(
          mode
        ) && <MFPlaceholder mode={mode} />}
      </div>
    </MFProfileContext.Provider>
  );
}
