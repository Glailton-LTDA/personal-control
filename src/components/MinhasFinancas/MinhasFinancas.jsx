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
import MFTransacaoScreen from './MFTransacaoScreen';
import MFTransferModal from './MFTransferModal';
import {
  currentMonthKey,
  useMFProfiles,
  useMFAccounts,
  useMFExtendFixedSeries,
} from '../../hooks/useMinhasFinancas';
import { MFProfileContext } from '../../hooks/mfProfileContext';
import { SyncEngine } from '../../lib/offline/SyncEngine';

const PROFILE_STORAGE_KEY = 'mf_active_profile';

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
  const [monthKey, setMonthKey] = useState(() => currentMonthKey());
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

  /** Transferência abre o modal; os demais tipos abrem a tela de criação. */
  const handleAdd = (kind) => {
    if (kind === 'transfer') {
      setTransferOpen(true);
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
    const engine = new SyncEngine(user.id);
    engine.sync().catch(() => {});
    const onSynced = () => queryClient.invalidateQueries();
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
        {/* FAB "+" do módulo (Despesa · Despesa cartão · Receita ·
            Transferência) — escondido em detalhe/2ª tela */}
        {!fabHidden && (
          <MFAddMenu
            variant="fab"
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
