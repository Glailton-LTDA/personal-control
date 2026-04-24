/**
 * Formata uma data de forma segura, evitando problemas de timezone (fuso horário).
 * Ideal para strings 'YYYY-MM-DD' vindo do banco de dados.
 */
export function formatDate(dateString, options = {}) {
  if (!dateString) return '';
  
  // Se for apenas YYYY-MM-DD, adicionamos o horário para garantir que seja interpretado como local
  // ou manipulamos manualmente as partes para evitar o deslocamento de UTC.
  const date = new Date(dateString + 'T00:00:00');
  
  // Se a data for inválida (ex: já tem T... ou formato diferente), tenta o fallback padrão
  if (isNaN(date.getTime())) {
    return new Date(dateString).toLocaleDateString('pt-BR', options);
  }
  
  return date.toLocaleDateString('pt-BR', options);
}
