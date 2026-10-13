import { describe, it, expect } from 'vitest';
import { buildFelixRequest, felixReplyOf } from './mfFelixRequest';

describe('buildFelixRequest', () => {
  it('normaliza mensagens e monta contexto com IDs reais', () => {
    const body = buildFelixRequest({
      messages: [
        { role: 'user', content: '  Quanto gastei?  ' },
        { role: 'assistant', content: 'Você gastou R$ 1.200,00' },
        { role: 'user', content: '   ' }, // vazia → filtrada
        { role: 'system', content: 'injetada' }, // papel inválido → filtrada
        { role: 'user' }, // sem conteúdo → filtrada
      ],
      accounts: [
        { id: 'acc-1', name: 'Nubank', account_type: 'CORRENTE', currency: 'BRL' },
        { id: 'acc-2', name: 'Poupança', currency: null },
      ],
      categories: [
        { id: 'cat-1', name: 'Alimentação', parent_id: null },
        { id: 'cat-2', name: 'Lanche', parent_id: 'cat-1' },
      ],
      language: 'en-US',
    });

    expect(body.messages).toEqual([
      { role: 'user', content: 'Quanto gastei?' },
      { role: 'assistant', content: 'Você gastou R$ 1.200,00' },
    ]);
    expect(body.context.language).toBe('en-US');
    expect(body.context.accounts).toEqual([
      { id: 'acc-1', name: 'Nubank', type: 'CORRENTE', currency: 'BRL' },
      { id: 'acc-2', name: 'Poupança', type: 'CONTA', currency: 'BRL' },
    ]);
    expect(body.context.categories).toEqual([
      { id: 'cat-1', name: 'Alimentação', parent_id: null },
      { id: 'cat-2', name: 'Lanche', parent_id: 'cat-1' },
    ]);
  });

  it('usa padrões seguros quando não há dados', () => {
    const body = buildFelixRequest({});
    expect(body.messages).toEqual([]);
    expect(body.context).toEqual({
      language: 'pt-BR',
      accounts: [],
      categories: [],
    });
  });
});

describe('felixReplyOf', () => {
  it('extrai e normaliza a resposta', () => {
    expect(felixReplyOf({ reply: '  Olá!  ' })).toBe('Olá!');
    expect(felixReplyOf({ reply: '' })).toBe('');
    expect(felixReplyOf({ configured: false })).toBe('');
    expect(felixReplyOf(null)).toBe('');
    expect(felixReplyOf(undefined)).toBe('');
  });
});
