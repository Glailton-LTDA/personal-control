import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { buildPath, normalizePath, parsePath, useRouter } from './useRouter';

describe('useRouter hook', () => {
  beforeEach(() => {
    localStorage.clear();
    // Limpa a URL padrão para '/'
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('deve iniciar com a rota padrão se a URL e o localStorage estiverem vazios', () => {
    const { result } = renderHook(() => useRouter('launchpad'));
    expect(result.current.currentPath).toBe('launchpad');
    expect(window.location.pathname).toBe('/launchpad');
  });

  it('deve iniciar com a rota definida na URL se ela estiver presente', () => {
    window.history.replaceState(null, '', '/finances/dashboard');
    const { result } = renderHook(() => useRouter('launchpad'));
    expect(result.current.currentPath).toBe('finances/dashboard');
  });

  it('deve iniciar com a rota do localStorage se a URL estiver vazia', () => {
    localStorage.setItem('personal-control-active-tab', 'investments/dashboard');
    const { result } = renderHook(() => useRouter('launchpad'));
    expect(result.current.currentPath).toBe('investments/dashboard');
    expect(window.location.pathname).toBe('/investments/dashboard');
  });

  it('deve atualizar o estado, a URL e o localStorage ao chamar navigate', () => {
    const { result } = renderHook(() => useRouter('launchpad'));
    
    act(() => {
      result.current.navigate('cars/list');
    });

    expect(result.current.currentPath).toBe('cars/list');
    expect(window.location.pathname).toBe('/cars/list');
    expect(localStorage.getItem('personal-control-active-tab')).toBe('cars/list');
  });

  it('deve sincronizar o estado quando o evento popstate é disparado', () => {
    const { result } = renderHook(() => useRouter('launchpad'));
    
    act(() => {
      window.history.pushState(null, '', '/trips/list');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(result.current.currentPath).toBe('trips/list');
    expect(localStorage.getItem('personal-control-active-tab')).toBe('trips/list');
  });

  it('redireciona caminhos legados para o formato aninhado', () => {
    window.history.replaceState(null, '', '/minhasfinancas-accounts');
    const { result } = renderHook(() => useRouter('launchpad'));

    expect(result.current.currentPath).toBe('minhasfinancas/accounts');
    expect(window.location.pathname).toBe('/minhasfinancas/accounts');
    expect(normalizePath('trips-itinerary')).toBe('trips/itinerary');
  });

  it('normaliza rotas antigas ao navegar para trás/avançar no histórico', () => {
    const { result } = renderHook(() => useRouter('launchpad'));
    window.history.pushState(null, '', '/trips-itinerary');
    act(() => window.dispatchEvent(new PopStateEvent('popstate')));

    expect(result.current.currentPath).toBe('trips/itinerary');
    expect(window.location.pathname).toBe('/trips/itinerary');
  });

  it('interpreta e monta rota de detalhe com id', () => {
    expect(parsePath('minhasfinancas/accounts/conta-123')).toEqual({
      module: 'minhasfinancas',
      screen: 'accounts',
      params: { id: 'conta-123' },
    });
    expect(buildPath('minhasfinancas', 'cards', { id: 'cartao-456' })).toBe(
      'minhasfinancas/cards/cartao-456'
    );
  });

  it('interpreta a rota do grupo de contas sem confundir com o detalhe da conta', () => {
    expect(parsePath('minhasfinancas/accounts/grupo/grp-1')).toEqual({
      module: 'minhasfinancas',
      screen: 'accounts',
      params: { groupId: 'grp-1' },
    });
    expect(parsePath('minhasfinancas/accounts/grupo/mf-ungrouped')).toEqual({
      module: 'minhasfinancas',
      screen: 'accounts',
      params: { groupId: 'mf-ungrouped' },
    });
    // O detalhe da conta continua com params.id (sem groupId).
    const account = parsePath('minhasfinancas/accounts/conta-123');
    expect(account.params).toEqual({ id: 'conta-123' });
    expect(account.params.groupId).toBeUndefined();
  });

  it('interpreta a tela cheia de gráficos e o drill-down da categoria', () => {
    expect(parsePath('minhasfinancas/resumo/graficos/contas/type')).toEqual({
      module: 'minhasfinancas',
      screen: 'resumo',
      params: { chart: 'contas', grouping: 'type', category: null },
    });
    expect(
      parsePath('minhasfinancas/resumo/graficos/despesas/category/category%3Acat-food')
    ).toEqual({
      module: 'minhasfinancas',
      screen: 'resumo',
      params: {
        chart: 'despesas',
        grouping: 'category',
        category: 'category:cat-food',
      },
    });
  });

  it('mapeia rotas aninhadas de música para os modos existentes', () => {
    expect(parsePath('music/songs/song-123')).toEqual({
      module: 'music',
      screen: 'song-song-123',
      params: { id: 'song-123' },
    });
    expect(parsePath('music/repertoire/letter/b')).toEqual({
      module: 'music',
      screen: 'repertoire-letter-b',
      params: { letter: 'b' },
    });
    expect(normalizePath('music-song-song-123')).toBe('music/songs/song-123');
  });
});
