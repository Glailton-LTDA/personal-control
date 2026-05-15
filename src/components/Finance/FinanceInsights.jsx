import React from 'react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { Zap, Target, AlertTriangle, TrendingUp, TrendingDown, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function FinanceInsights({ stats, prevStats, categoryData, prevCategoryData, finances = [], loading, showValues, month, year }) {
  const { t, i18n } = useTranslation();

  if (loading) return <div className="skeleton" style={{ height: '120px', borderRadius: '24px' }} />;

  // 1. Calculate Smarter Projection OR Historical Summary
  const today = new Date();
  const isCurrentMonth = today.getMonth() === month && today.getFullYear() === year;
  const isPastMonth = (year < today.getFullYear()) || (year === today.getFullYear() && month < today.getMonth());
  
  let projection = null;
  let historicalSummary = null;

  if (isCurrentMonth && stats.expense > 0 && finances.length > 0) {
    // Current Month: Projection logic (already implemented)
    const dayOfMonth = today.getDate();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const expenses = finances.filter(f => f.type === 'DESPESA');
    const avgTransaction = expenses.length > 0 ? stats.expense / expenses.length : 0;
    const largeThreshold = avgTransaction * 2.5; 
    const largeExpenses = expenses.filter(e => Number(e.amount) > largeThreshold);
    const smallExpenses = expenses.filter(e => Number(e.amount) <= largeThreshold);
    const largeTotal = largeExpenses.reduce((acc, curr) => acc + Number(curr.amount), 0);
    const smallTotal = smallExpenses.reduce((acc, curr) => acc + Number(curr.amount), 0);
    const dailySmallAvg = smallTotal / dayOfMonth;
    projection = largeTotal + (dailySmallAvg * daysInMonth);
  } else if (isPastMonth && stats.expense > 0 && prevStats.expense > 0) {
    // Past Month: Performance vs Previous Month
    const diff = ((stats.expense - prevStats.expense) / prevStats.expense) * 100;
    historicalSummary = {
      percent: Math.abs(Math.round(diff)),
      isPositive: diff < 0, // Savings is positive performance
      amount: Math.abs(stats.expense - prevStats.expense)
    };
  }

  // 2. Identify Category Anomalies or Wins
  const insights = [];

  categoryData.forEach(cat => {
    const prevCat = prevCategoryData.find(pc => pc.name === cat.name);
    if (prevCat && prevCat.value > 0) {
      const diff = ((cat.value - prevCat.value) / prevCat.value) * 100;
      if (diff > 20) {
        insights.push({
          type: 'alert',
          title: cat.name,
          percent: Math.round(diff),
          icon: <AlertTriangle size={18} />,
          color: 'var(--danger)',
          bg: 'rgba(239, 68, 68, 0.1)'
        });
      } else if (diff < -15) {
        insights.push({
          type: 'win',
          title: cat.name,
          percent: Math.abs(Math.round(diff)),
          icon: <TrendingDown size={18} />,
          color: 'var(--success)',
          bg: 'rgba(16, 185, 129, 0.1)'
        });
      }
    }
  });

  const formatCurrency = (val) => {
    if (!showValues) return '••••';
    const symbol = t('common.currency_symbol', 'R$');
    const formattedValue = Number(val).toLocaleString(i18n.language, { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    });
    return `${symbol} ${formattedValue}`;
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>
      
      {/* Projection Card (Current Month) */}
      {projection && (
        <Motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="glass-card"
          style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', border: '1px solid var(--primary-low)' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ padding: '0.5rem', borderRadius: '10px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary)' }}>
              <Zap size={20} />
            </div>
            <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, textTransform: 'uppercase' }}>{t('finances.insights.projection')}</h4>
          </div>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {t('finances.insights.burn_rate_desc', { amount: formatCurrency(projection) })}
          </p>
          <div style={{ height: '4px', width: '100%', background: 'var(--tabs-bg)', borderRadius: '2px', overflow: 'hidden', marginTop: 'auto' }}>
            <div style={{ 
              height: '100%', 
              width: `${Math.min((stats.expense / (projection || 1)) * 100, 100)}%`, 
              background: 'var(--primary)',
              transition: 'width 1s ease-out'
            }} />
          </div>
        </Motion.div>
      )}

      {/* Historical Summary Card (Past Months) */}
      {historicalSummary && (
        <Motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="glass-card"
          style={{ 
            padding: '1.5rem', 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '0.75rem', 
            border: `1px solid ${historicalSummary.isPositive ? 'var(--success-low)' : 'var(--danger-low)'}` 
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ 
              padding: '0.5rem', 
              borderRadius: '10px', 
              background: historicalSummary.isPositive ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', 
              color: historicalSummary.isPositive ? 'var(--success)' : 'var(--danger)' 
            }}>
              {historicalSummary.isPositive ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
            </div>
            <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, textTransform: 'uppercase' }}>
              {historicalSummary.isPositive ? t('finances.insights.budget_safe') : t('finances.expense_label')}
            </h4>
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {historicalSummary.isPositive 
                ? t('finances.insights.monthly_win_desc', { percent: historicalSummary.percent, amount: formatCurrency(historicalSummary.amount) })
                : t('finances.insights.monthly_loss_desc', { percent: historicalSummary.percent, amount: formatCurrency(historicalSummary.amount) })
              }
            </p>
          </div>
          <div style={{ 
            fontSize: '1.25rem', 
            fontWeight: 800, 
            color: historicalSummary.isPositive ? 'var(--success)' : 'var(--danger)',
            marginTop: '0.5rem'
          }}>
            {historicalSummary.isPositive ? `-${historicalSummary.percent}%` : `+${historicalSummary.percent}%`}
          </div>
        </Motion.div>
      )}

      {/* Dynamic Insights (Alerts/Wins) */}
      <AnimatePresence mode="popLayout">
        {insights.slice(0, 2).map((insight, index) => (
          <Motion.div 
            key={insight.title}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ delay: index * 0.1 }}
            className="glass-card"
            style={{ padding: '1.5rem', display: 'flex', gap: '1.25rem', alignItems: 'center' }}
          >
            <div style={{ 
              width: '48px', 
              height: '48px', 
              borderRadius: '14px', 
              background: insight.bg, 
              color: insight.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              {insight.icon}
            </div>
            <div style={{ flex: 1 }}>
              <h5 style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                {insight.type === 'alert' ? t('finances.expense_label') : t('finances.insights.budget_safe')}
              </h5>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.9rem', fontWeight: 600 }}>
                {insight.type === 'alert' 
                  ? t('finances.insights.category_alert', { category: insight.title, percent: insight.percent })
                  : t('finances.insights.saving_win', { category: insight.title, percent: insight.percent })}
              </p>
            </div>
            <div style={{ color: insight.color, opacity: 0.5 }}>
              <ArrowRight size={18} />
            </div>
          </Motion.div>
        ))}

        {insights.length === 0 && !projection && (
          <Motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="glass-card"
            style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', gridColumn: 'span 2' }}
          >
            <CheckCircle2 size={24} color="var(--success)" />
            <div>
              <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800 }}>{t('finances.insights.budget_safe')}</h4>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('finances.insights.no_previous_data')}</p>
            </div>
          </Motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
