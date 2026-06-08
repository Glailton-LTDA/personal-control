import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRouter } from './useRouter';

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
    window.history.replaceState(null, '', '/finances-dashboard');
    const { result } = renderHook(() => useRouter('launchpad'));
    expect(result.current.currentPath).toBe('finances-dashboard');
  });

  it('deve iniciar com a rota do localStorage se a URL estiver vazia', () => {
    localStorage.setItem('personal-control-active-tab', 'investments-dashboard');
    const { result } = renderHook(() => useRouter('launchpad'));
    expect(result.current.currentPath).toBe('investments-dashboard');
    expect(window.location.pathname).toBe('/investments-dashboard');
  });

  it('deve atualizar o estado, a URL e o localStorage ao chamar navigate', () => {
    const { result } = renderHook(() => useRouter('launchpad'));
    
    act(() => {
      result.current.navigate('cars-list');
    });

    expect(result.current.currentPath).toBe('cars-list');
    expect(window.location.pathname).toBe('/cars-list');
    expect(localStorage.getItem('personal-control-active-tab')).toBe('cars-list');
  });

  it('deve sincronizar o estado quando o evento popstate é disparado', () => {
    const { result } = renderHook(() => useRouter('launchpad'));
    
    act(() => {
      window.history.pushState(null, '', '/trips-list');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(result.current.currentPath).toBe('trips-list');
    expect(localStorage.getItem('personal-control-active-tab')).toBe('trips-list');
  });
});
