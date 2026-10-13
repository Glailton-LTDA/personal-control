/**
 * Helpers puros do assistente Felix (Fase 8).
 *
 * Monta o corpo da chamada da Edge Function `finance-ai`:
 * - histórico de mensagens normalizado (só user/assistant com texto);
 * - contexto de IDs reais (contas/categorias) para o LLM usar nas
 *   tools sem inventar IDs.
 */

export const buildFelixRequest = ({
  messages = [],
  accounts = [],
  categories = [],
  language = 'pt-BR',
} = {}) => ({
  messages: messages
    .filter(
      (m) =>
        (m?.role === 'user' || m?.role === 'assistant') &&
        typeof m.content === 'string' &&
        m.content.trim() !== ''
    )
    .map((m) => ({ role: m.role, content: m.content.trim() })),
  context: {
    language,
    accounts: accounts.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.account_type ?? a.type ?? 'CONTA',
      currency: a.currency || 'BRL',
    })),
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      parent_id: c.parent_id ?? null,
    })),
  },
});

/** Extrai o texto da resposta da Edge Function ('' se não houver). */
export const felixReplyOf = (data) =>
  data && typeof data.reply === 'string' ? data.reply.trim() : '';
