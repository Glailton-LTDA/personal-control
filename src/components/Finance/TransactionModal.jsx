import React, { useState, useEffect } from 'react';
import { X, Save, Calendar, Tag, DollarSign, User, CheckCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { 
  useFinanceCategories, 
  useFinanceResponsibles, 
  useCreateTransaction, 
  useUpdateTransaction 
} from '../../hooks/useFinance';

const DEFAULT_MAPPINGS = [
  { keywords: ['uber'], category: 'Transporte', type: 'DESPESA' },
  { keywords: ['mercado', 'supermercado'], category: 'Alimentação', type: 'DESPESA' },
  { keywords: ['aluguel', 'condomínio', 'condominio'], category: 'Moradia', type: 'DESPESA' },
  { keywords: ['luz', 'energia', 'água', 'agua', 'internet'], category: 'Serviços', type: 'DESPESA' },
  { keywords: ['academia', 'médico', 'medico'], category: 'Saúde', type: 'DESPESA' },
  { keywords: ['restaurante', 'ifood'], category: 'Alimentação', type: 'DESPESA' },
  { keywords: ['salário', 'salario', 'recebimento'], category: 'Receitas', type: 'RECEITA' }
];

export default function TransactionModal({ isOpen, onClose, user, initialData = null }) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    description: '',
    amount: '',
    payment_date: new Date().toLocaleDateString('en-CA'),
    type: 'DESPESA',
    category: '',
    paid_by: '',
    status: 'PENDENTE'
  });
  const [isCategoryManual, setIsCategoryManual] = useState(false);

  const { data: categories = [] } = useFinanceCategories();
  const { data: responsibles = [] } = useFinanceResponsibles();
  const createMutation = useCreateTransaction();
  const updateMutation = useUpdateTransaction();

  const loading = createMutation.isPending || updateMutation.isPending;

  useEffect(() => {
    if (initialData) {
      setFormData({
        ...initialData,
        amount: (initialData.amount || 0).toFixed(2).replace('.', ','),
        payment_date: initialData.payment_date
      });
      setIsCategoryManual(!!initialData.category);
    } else {
      setFormData({
        description: '',
        amount: '',
        payment_date: new Date().toLocaleDateString('en-CA'),
        type: 'DESPESA',
        category: '',
        paid_by: '',
        status: 'PENDENTE'
      });
      setIsCategoryManual(false);
    }
  }, [initialData, isOpen]);

  const handleDescriptionChange = (e) => {
    const value = e.target.value;
    setFormData(prev => {
      const updated = { ...prev, description: value };
      if (!isCategoryManual || !prev.category) {
        const descLower = value.toLowerCase();
        const match = DEFAULT_MAPPINGS.find(m => 
          m.keywords.some(kw => descLower.includes(kw))
        );
        if (match) {
          const matchedCategory = categories.find(c => 
            c.name.toLowerCase() === match.category.toLowerCase() && c.type === match.type
          );
          if (matchedCategory) {
            updated.category = matchedCategory.name;
            updated.type = match.type;
          }
        }
      }
      return updated;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const numericAmount = parseFloat(formData.amount.replace(',', '.'));
    const dataToSave = { ...formData, amount: numericAmount };
    
    try {
      if (initialData?.id) {
        // Edit
        await updateMutation.mutateAsync({ id: initialData.id, ...dataToSave });
      } else {
        // Create
        await createMutation.mutateAsync({ ...dataToSave, user_id: user.id });
      }
      onClose();
    } catch (err) {
      console.error("Erro ao salvar transação:", err);
    }
  };

  if (!isOpen) return null;

  const filteredCategories = categories.filter(c => c.type === formData.type);

  return (
    <div className="modal-overlay">
      <div className="glass-card modal-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <div>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 800 }}>{initialData ? t('finance.edit_transaction', 'Editar Lançamento') : t('finance.new_transaction', 'Novo Lançamento')}</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{initialData ? t('finance.edit_desc', 'Altere as informações do registro') : t('finance.new_desc', 'Adicione uma nova transação financeira')}</p>
          </div>
          <button className="icon-btn" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label><Tag size={14} style={{ marginRight: '4px' }}/> {t('finance.description', 'Descrição')}</label>
            <input 
              type="text" required value={formData.description}
              onChange={handleDescriptionChange}
              placeholder={t('finance.description_placeholder', 'Ex: Aluguel, Salário...')}
            />
          </div>

          <div className="form-grid">
            <div className="input-group">
              <label><DollarSign size={14} style={{ marginRight: '4px' }}/> {t('finance.amount', 'Valor (R$)')}</label>
              <input 
                type="text" 
                required 
                value={formData.amount}
                placeholder={t('finance.amount_placeholder')}
                onChange={e => {
                  let val = e.target.value.replace(/\D/g, '');
                  if (!val) {
                    setFormData({...formData, amount: ''});
                    return;
                  }
                  val = (parseInt(val) / 100).toFixed(2);
                  setFormData({...formData, amount: val.replace('.', ',')});
                }}
              />
            </div>
            <div className="input-group">
              <label><Calendar size={14} style={{ marginRight: '4px' }}/> {t('finance.date', 'Data')}</label>
              <input 
                type="date" required value={formData.payment_date}
                onChange={e => setFormData({...formData, payment_date: e.target.value})}
              />
            </div>
          </div>

          <div className="form-grid">
            <div className="input-group">
              <label>{t('finance.type', 'Tipo')}</label>
              <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})}>
                <option value="DESPESA">{t('finance.expense', 'Despesa')}</option>
                <option value="RECEITA">{t('finance.income', 'Receita')}</option>
              </select>
            </div>
            <div className="input-group">
              <label><User size={14} style={{ marginRight: '4px' }}/> {t('finance.responsible', 'Responsável')}</label>
              <select 
                required value={formData.paid_by} 
                onChange={e => setFormData({...formData, paid_by: e.target.value})}
              >
                <option value="">{t('common.select_placeholder', 'Selecione...')}</option>
                {responsibles.map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
              </select>
            </div>
          </div>

          <div className="form-grid">
            <div className="input-group">
              <label>{t('finance.category', 'Categoria')}</label>
              <select 
                required value={formData.category} 
                onChange={e => {
                  setFormData({...formData, category: e.target.value});
                  setIsCategoryManual(!!e.target.value);
                }}
              >
                <option value="">{t('common.select_placeholder', 'Selecione...')}</option>
                {filteredCategories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label>{t('finance.status', 'Status')}</label>
              <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
                <option value="PAGO">{t('finance.paid', 'Pago')}</option>
                <option value="PENDENTE">{t('finance.pending', 'Pendente')}</option>
              </select>
            </div>
          </div>

          <div style={{ marginTop: '2rem' }}>
            <button disabled={loading} className="btn-primary" style={{ width: '100%', height: '3.5rem' }}>
              {loading ? t('common.processing', 'Processando...') : <><Save size={22} /> {initialData ? t('finance.update_data', 'Atualizar Dados') : t('finance.save_transaction', 'Salvar Lançamento')}</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
