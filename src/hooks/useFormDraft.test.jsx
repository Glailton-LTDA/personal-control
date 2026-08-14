import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFormDraft } from './useFormDraft';

describe('useFormDraft hook', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('deve inicializar com o estado inicial padrão se sessionStorage estiver vazio', () => {
    const initialState = { description: '', amount: '' };
    const { result } = renderHook(() => useFormDraft('test_form', initialState));

    const [formData, , , isDirty] = result.current;
    expect(formData).toEqual(initialState);
    expect(isDirty).toBe(false);
  });

  it('deve carregar o rascunho previamente salvo do sessionStorage', () => {
    const initialState = { description: '', amount: '' };
    const savedDraft = { description: 'Mercado', amount: '150,00' };
    sessionStorage.setItem('draft_test_form', JSON.stringify(savedDraft));

    const { result } = renderHook(() => useFormDraft('test_form', initialState));

    const [formData, , , isDirty] = result.current;
    expect(formData).toEqual(savedDraft);
    expect(isDirty).toBe(true);
  });

  it('deve atualizar e persistir o estado no sessionStorage quando setFormData for chamado', () => {
    const initialState = { description: '', amount: '' };
    const { result } = renderHook(() => useFormDraft('test_form', initialState));

    act(() => {
      const [, setFormData] = result.current;
      setFormData({ description: 'Combustível', amount: '200,00' });
    });

    const [formData, , , isDirty] = result.current;
    expect(formData).toEqual({ description: 'Combustível', amount: '200,00' });
    expect(isDirty).toBe(true);
    expect(sessionStorage.getItem('draft_test_form')).toBe(
      JSON.stringify({ description: 'Combustível', amount: '200,00' })
    );
  });

  it('deve limpar o rascunho do sessionStorage e resetar o estado ao chamar clearDraft', () => {
    const initialState = { description: '', amount: '' };
    const { result } = renderHook(() => useFormDraft('test_form', initialState));

    act(() => {
      const [, setFormData] = result.current;
      setFormData({ description: 'Manutenção', amount: '500,00' });
    });

    expect(sessionStorage.getItem('draft_test_form')).not.toBeNull();

    act(() => {
      const [, , clearDraft] = result.current;
      clearDraft();
    });

    const [formData, , , isDirty] = result.current;
    expect(formData).toEqual(initialState);
    expect(isDirty).toBe(false);
    expect(sessionStorage.getItem('draft_test_form')).toBeNull();
  });

  it('não deve ler nem salvar no sessionStorage se enabled for false', () => {
    const initialState = { description: 'Original', amount: '100' };
    sessionStorage.setItem('draft_edit_form', JSON.stringify({ description: 'Diferente' }));

    const { result } = renderHook(() => useFormDraft('edit_form', initialState, false));

    const [formData, setFormData, , isDirty] = result.current;
    expect(formData).toEqual(initialState);
    expect(isDirty).toBe(false);

    act(() => {
      setFormData({ description: 'Alterado' });
    });

    expect(sessionStorage.getItem('draft_edit_form')).toBe(
      JSON.stringify({ description: 'Diferente' })
    );
  });
});
