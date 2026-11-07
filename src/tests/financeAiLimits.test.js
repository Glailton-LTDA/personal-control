import { describe,it,expect } from 'vitest';
import { readFelixBody,validFelixPayload } from '../../supabase/functions/finance-ai/requestLimits.ts';

describe('limites de entrada do Felix', () => {
  it('aceita conversa válida e limita tamanho/quantidade de mensagens', () => {
    expect(validFelixPayload({messages:[{role:'user',content:'resumo'}]})).toBe(true);
    expect(validFelixPayload({messages:Array(41).fill({role:'user',content:'x'})})).toBe(false);
    expect(validFelixPayload({messages:[{role:'user',content:'x'.repeat(8001)}]})).toBe(false);
    expect(validFelixPayload({messages:[{role:'system',content:'x'}]})).toBe(false);
    expect(validFelixPayload({messages:'inválido'})).toBe(false);
  });
  it('limita corpo mesmo sem Content-Length', async () => {
    await expect(readFelixBody(new Request('https://example.test',{method:'POST',body:'x'.repeat(70000)}))).rejects.toThrow('payload_too_large');
    expect(await readFelixBody(new Request('https://example.test',{method:'POST',body:'{"messages":[]}'}))).toEqual({messages:[]});
  });
});
