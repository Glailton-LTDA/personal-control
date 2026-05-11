/**
 * Formata uma data de forma segura, evitando problemas de timezone (fuso horário).
 * Ideal para strings 'YYYY-MM-DD' vindo do banco de dados.
 */
export function formatDate(dateString, options = {}) {
  if (!dateString) return '';
  
  const locale = localStorage.getItem('i18nextLng') || 'pt-BR';
  const date = new Date(dateString + 'T00:00:00');
  
  if (isNaN(date.getTime())) {
    return new Date(dateString).toLocaleDateString(locale, options);
  }
  
  return date.toLocaleDateString(locale, options);
}
