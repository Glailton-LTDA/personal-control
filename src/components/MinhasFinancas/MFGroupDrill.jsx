import React from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, FolderTree, Plus } from 'lucide-react';
import {
  groupTotalsByCurrency,
  countableRows,
  formatTotals,
} from '../../hooks/useMinhasFinancas';
import MFAccountIcon from './MFAccountIcon';
import MFGroupIcon from './MFGroupIcon';

/** Ids do subgrupo (raiz + descendentes) — evita ciclo mesmo com dados ruins. */
const subtreeIds = (rootId, groups) => {
  const ids = new Set([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    groups.forEach((group) => {
      if (group.parent_id && ids.has(group.parent_id) && !ids.has(group.id)) {
        ids.add(group.id);
        grew = true;
      }
    });
  }
  return ids;
};

/**
 * Drill-down de grupo no Resumo: clicar num grupo abre esta tela com
 * o cabeçalho do grupo (breadcrumb, avatar, contagem da subárvore e
 * totais), os grupos filhos (para descer mais um nível) e as contas da
 * subárvore — diretas primeiro e depois as dos subgrupos com chip —
 * cada uma abrindo o detalhe.
 *
 * Cabeçalho: breadcrumb clicável (Resumo / Nubank / Caixinhas) +
 * avatar em gradiente com o emoji + nome + contagem; à direita o botão
 * "Novo subgrupo" e o total do subgrupo quando o grupo soma os totais.
 * Na seção de contas, o botão "Nova conta" cria a conta já no grupo.
 */
export default function MFGroupDrill({
  groups = [],
  rows = [],
  path = [],
  showValues = true,
  onNavigate = () => {},
  onOpenAccount = () => {},
  onNewAccount,
  onNewSubgroup,
}) {
  const { t } = useTranslation();
  const byId = new Map(groups.map((group) => [group.id, group]));
  const current = byId.get(path[path.length - 1]);
  if (!current) return null;

  const children = groups.filter(
    (group) => group.parent_id === current.id && group.show_in_summary
  );
  const directRows = rows.filter((row) => row.group_id === current.id);
  const ids = subtreeIds(current.id, groups);
  const subRows = rows.filter((row) => ids.has(row.group_id));
  // Contas listadas no painel: diretas primeiro, depois as dos subgrupos
  // (com chip do grupo) — entrar no pai já mostra o que há dentro.
  const listedRows = [
    ...directRows,
    ...subRows.filter((row) => row.group_id !== current.id),
  ];
  const descendantGroups = groups.filter(
    (group) => group.id !== current.id && ids.has(group.id) && group.show_in_summary
  ).length;

  const crumbButton = (label, onClick, testId, isLast) => (
    <React.Fragment key={testId}>
      <button
        type="button"
        data-testid={testId}
        onClick={onClick}
        style={{
          border: 'none',
          background: 'transparent',
          padding: 0,
          font: 'inherit',
          fontSize: '0.78rem',
          fontWeight: isLast ? 800 : 600,
          color: isLast ? 'var(--text-main)' : 'var(--text-muted)',
          cursor: isLast ? 'default' : 'pointer',
          textDecoration: isLast ? 'none' : 'underline',
        }}
        disabled={isLast}
      >
        {label}
      </button>
      {!isLast && <ChevronRight size={12} style={{ color: 'var(--text-muted)' }} />}
    </React.Fragment>
  );

  const avatarStyle = {
    width: 52,
    height: 52,
    borderRadius: 16,
    display: 'grid',
    placeItems: 'center',
    fontSize: '1.5rem',
    background:
      'linear-gradient(135deg, color-mix(in srgb, var(--primary) 30%, transparent), color-mix(in srgb, #8b5cf6 25%, transparent))',
    border: '1px solid var(--glass-border)',
    flexShrink: 0,
  };

  const childCardStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.7rem',
    padding: '0.85rem 1rem',
    borderRadius: 14,
    border: '1px solid var(--glass-border)',
    background: 'var(--input-bg)',
    cursor: 'pointer',
    textAlign: 'left',
    font: 'inherit',
    color: 'var(--text-main)',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Cabeçalho do grupo */}
      <div className="glass-card" data-testid="mf-group-drill" style={{ padding: '1.25rem 1.5rem' }}>
        <nav
          aria-label={t('minhasfinancas.dash_widget_groups')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            flexWrap: 'wrap',
            marginBottom: '0.9rem',
          }}
        >
          {crumbButton(
            t('minhasfinancas.group_crumb_summary'),
            () => onNavigate([]),
            'mf-group-crumb-summary',
            path.length === 0
          )}
          {path.map((id, index) =>
            crumbButton(
              byId.get(id)?.name ?? '—',
              () => onNavigate(path.slice(0, index + 1)),
              `mf-group-crumb-${id}`,
              index === path.length - 1
            )
          )}
        </nav>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
            <span style={avatarStyle} aria-hidden="true">
              <MFGroupIcon icon={current.icon} name={current.name} size={36} />
            </span>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>
                {current.name}
              </h2>
              <p
                style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}
              >
                {t('minhasfinancas.accounts_count', { count: subRows.length })}
                {descendantGroups > 0 &&
                  ` · ${t('minhasfinancas.groups_count', { count: descendantGroups })}`}
              </p>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              flexWrap: 'wrap',
              justifyContent: 'flex-end',
            }}
          >
            {onNewSubgroup && (
              <button
                type="button"
                className="btn-cancel"
                data-testid="mf-drill-new-subgroup"
                onClick={onNewSubgroup}
                style={{
                  padding: '0.45rem 0.85rem',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                <Plus size={14} />
                {t('minhasfinancas.group_new_sub')}
              </button>
            )}
            {current.sum_totals && (
              <div style={{ textAlign: 'right' }}>
                <p
                  data-testid="mf-group-drill-total"
                  style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800 }}
                >
                  {formatTotals(groupTotalsByCurrency(countableRows(subRows), 'saldo'), showValues)}
                </p>
                <p style={{ margin: '0.1rem 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  {t('minhasfinancas.group_total_label')}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Grupos filhos */}
      {children.length > 0 && (
        <div className="glass-card" style={{ padding: '1.25rem 1.5rem' }}>
          <h3
            style={{
              margin: '0 0 0.85rem',
              fontSize: '0.9rem',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <FolderTree size={15} />
            {t('minhasfinancas.group_subgroups')}
          </h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
              gap: '0.75rem',
            }}
          >
            {children.map((child) => {
              const childIds = subtreeIds(child.id, groups);
              const childRows = rows.filter((row) => childIds.has(row.group_id));
              const childCount = childRows.length;
              return (
                <button
                  key={child.id}
                  type="button"
                  data-testid={`mf-group-drill-card-${child.id}`}
                  onClick={() => onNavigate([...path, child.id])}
                  style={childCardStyle}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 12,
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: '1.1rem',
                      background: 'color-mix(in srgb, var(--primary) 14%, transparent)',
                      flexShrink: 0,
                    }}
                  >
                    <MFGroupIcon icon={child.icon} name={child.name} size={27} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        display: 'block',
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {child.name}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {t('minhasfinancas.accounts_count', { count: childCount })}
                    </span>
                  </span>
                  {child.sum_totals && (
                    <span style={{ fontWeight: 800, fontSize: '0.88rem' }}>
                      {formatTotals(groupTotalsByCurrency(countableRows(childRows), 'saldo'), showValues)}
                    </span>
                  )}
                  <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Contas diretas do grupo */}
      <div className="glass-card" style={{ padding: '1.25rem 1.5rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            marginBottom: '0.85rem',
          }}
        >
          <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800 }}>
            {t('minhasfinancas.group_accounts')}
          </h3>
          {onNewAccount && (
            <button
              type="button"
              className="btn-cancel"
              data-testid="mf-drill-new-account"
              onClick={onNewAccount}
              style={{
                padding: '0.35rem 0.7rem',
                fontSize: '0.78rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              <Plus size={13} />
              {t('minhasfinancas.new_account')}
            </button>
          )}
        </div>

        {listedRows.length === 0 ? (
          <p
            data-testid="mf-group-drill-empty"
            style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}
          >
            {t('minhasfinancas.group_no_accounts')}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {listedRows.map((row) => (
              <button
                key={row.id}
                type="button"
                data-testid={`mf-group-drill-account-${row.id}`}
                onClick={() => onOpenAccount(row.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.7rem',
                  padding: '0.6rem 0.5rem',
                  borderRadius: 10,
                  border: '1px solid transparent',
                  background: 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  font: 'inherit',
                  color: 'var(--text-main)',
                }}
              >
                <MFAccountIcon account={row} size={20} />
                {row.group_id !== current.id && (
                  <span
                    data-testid={`mf-drill-group-chip-${row.id}`}
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      color: 'var(--text-muted)',
                      border: '1px solid var(--glass-border)',
                      borderRadius: 999,
                      padding: '0.1rem 0.5rem',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    {byId.get(row.group_id)?.name ?? '—'}
                  </span>
                )}
                <span
                  style={{
                    flex: 1,
                    fontSize: '0.88rem',
                    fontWeight: 700,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {row.name}
                </span>
                <span style={{ fontWeight: 800, fontSize: '0.88rem' }}>
                  {formatTotals(
                    groupTotalsByCurrency([row], 'saldo'),
                    showValues
                  )}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
