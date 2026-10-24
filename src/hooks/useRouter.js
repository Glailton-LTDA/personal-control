import { useState, useEffect, useCallback } from 'react';

/**
 * Mapeia o formato antigo de rota (ex.: "minhasfinancas-accounts") para o
 * novo formato aninhado (ex.: "minhasfinancas/accounts"). Usado para
 * redirect silencioso de bookmarks e localStorage salvos antes da mudança.
 */
const LEGACY_PATHS = {
  'minhasfinancas-resumo': 'minhasfinancas',
  'minhasfinancas-transactions': 'minhasfinancas/transactions',
  'minhasfinancas-accounts': 'minhasfinancas/accounts',
  'minhasfinancas-statement': 'minhasfinancas/statement',
  'minhasfinancas-import': 'minhasfinancas/import',
  'minhasfinancas-cards': 'minhasfinancas/cards',
  'minhasfinancas-budgets': 'minhasfinancas/budgets',
  'minhasfinancas-goals': 'minhasfinancas/goals',
  'minhasfinancas-reports': 'minhasfinancas/reports',
  'minhasfinancas-felix': 'minhasfinancas/felix',
  'minhasfinancas-settings': 'minhasfinancas/settings',
  'cars-list': 'cars/list',
  'cars-settings': 'cars/settings',
  'investments-dashboard': 'investments/dashboard',
  'investments-list': 'investments/list',
  'investments-settings': 'investments/settings',
  'trips-list': 'trips/list',
  'trips-itinerary': 'trips/itinerary',
  'trips-stats': 'trips/stats',
  'trips-settings': 'trips/settings',
  'lists-manager': 'lists/manager',
  'lists-notes': 'lists/notes',
  'lists-settings': 'lists/settings',
  'music-repertoire': 'music/repertoire',
  'music-setlists': 'music/setlists',
  'music-settings': 'music/settings',
  'settings-general': 'settings/general',
  'settings-security': 'settings/security',
};

/**
 * Converte um caminho no formato antigo (com hífen) para o novo formato
 * aninhado. Retorna o caminho convertido ou o original se não for legado.
 */
export function normalizePath(path) {
  const clean = String(path ?? '').replace(/^\//, '');
  const song = clean.match(/^music-song-(.+)$/);
  if (song) return `music/songs/${song[1]}`;
  const letter = clean.match(/^music-repertoire-letter-(.+)$/);
  if (letter) return `music/repertoire/letter/${letter[1]}`;
  const artist = clean.match(/^music-repertoire-artist-(.+)$/);
  if (artist) return `music/repertoire/artist/${artist[1]}`;
  return LEGACY_PATHS[clean] ?? clean;
}

/**
 * Extrai os componentes de uma rota.
 * Retorna { module, screen, params }:
 *  - "launchpad"                       → { module: 'launchpad', screen: null, params: {} }
 *  - "minhasfinancas"                  → { module: 'minhasfinancas', screen: 'resumo', params: {} }
 *  - "minhasfinancas/accounts"         → { module: 'minhasfinancas', screen: 'accounts', params: {} }
 *  - "minhasfinancas/accounts/{id}"    → { module: 'minhasfinancas', screen: 'accounts', params: { id } }
 *  - "cars/list"                       → { module: 'cars', screen: 'list', params: {} }
 */
export function parsePath(path) {
  const clean = String(path ?? '').replace(/^\//, '').replace(/\/$/, '');
  const segments = clean.split('/').filter(Boolean);

  if (!segments.length) {
    return { module: 'launchpad', screen: null, params: {} };
  }

  const [module, screenOrId, maybeId] = segments;

  // Rotas de detalhe/filtro do repertório musical preservam o formato de
  // `mode` que Music já entende, mas agora usam segmentos explícitos.
  if (module === 'music' && screenOrId === 'songs' && maybeId) {
    return { module, screen: `song-${maybeId}`, params: { id: maybeId } };
  }
  if (module === 'music' && screenOrId === 'repertoire' && segments[2] === 'letter' && segments[3]) {
    return { module, screen: `repertoire-letter-${segments[3]}`, params: { letter: segments[3] } };
  }
  if (module === 'music' && screenOrId === 'repertoire' && segments[2] === 'artist' && segments[3]) {
    const encodedArtist = segments.slice(3).join('/');
    const artist = decodeURIComponent(encodedArtist);
    return { module, screen: `repertoire-artist-${encodedArtist}`, params: { artist } };
  }

  // Módulos com tela default quando não há segundo segmento.
  const defaultScreen = {
    finances: 'dashboard',
    minhasfinancas: 'resumo',
    cars: 'list',
    investments: 'dashboard',
    trips: 'list',
    lists: 'manager',
    music: 'repertoire',
    settings: 'general',
  };

  const screen = screenOrId ?? defaultScreen[module] ?? null;
  const params = maybeId ? { id: maybeId } : {};

  return { module, screen, params };
}

/**
 * Monta um caminho a partir de módulo, tela e parâmetros opcionais.
 * Ex.: buildPath('minhasfinancas', 'accounts', { id: 'abc' })
 *      → "minhasfinancas/accounts/abc"
 */
export function buildPath(module, screen = null, params = {}) {
  if (module === 'launchpad') return 'launchpad';
  const parts = [module];
  if (screen) parts.push(screen);
  if (params.id) parts.push(params.id);
  return parts.join('/');
}

export function useRouter(defaultPath = 'launchpad') {
  const getPath = useCallback(() => {
    const path = window.location.pathname.replace(/^\//, '');
    if (path) {
      return normalizePath(path);
    }
    return normalizePath(localStorage.getItem('personal-control-active-tab') || defaultPath);
  }, [defaultPath]);

  const [currentPath, setCurrentPath] = useState(getPath);

  // O objeto parseado é derivado (não precisa de estado próprio), mas é
  // exposto para quem precisa dos segmentos/parâmetros.
  const route = parsePath(currentPath);

  useEffect(() => {
    // Sincroniza a URL inicial se ela estava vazia (ex: '/' -> '/finances-dashboard')
    const initialPath = getPath();
    const currentUrlPath = window.location.pathname.replace(/^\//, '');
    if (currentUrlPath !== initialPath) {
      window.history.replaceState(null, '', `/${initialPath}`);
    }
    localStorage.setItem('personal-control-active-tab', initialPath);
  }, [getPath]);

  useEffect(() => {
    const handlePopState = () => {
      const rawPath = window.location.pathname.replace(/^\//, '');
      const path = getPath();
      if (rawPath && rawPath !== path) {
        window.history.replaceState(null, '', `/${path}`);
      }
      setCurrentPath(path);
      localStorage.setItem('personal-control-active-tab', path);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [getPath]);

  // Redirect silencioso: se a URL ou o localStorage ainda guardam um caminho
  // antigo (com hífen), corrige para o novo formato sem adicionar entrada ao
  // histórico do navegador.
  useEffect(() => {
    const currentUrlPath = window.location.pathname.replace(/^\//, '');
    const normalized = normalizePath(currentUrlPath);
    if (normalized !== currentUrlPath) {
      window.history.replaceState(null, '', `/${normalized}`);
      setCurrentPath(normalized);
      localStorage.setItem('personal-control-active-tab', normalized);
    } else {
      const stored = localStorage.getItem('personal-control-active-tab');
      const normalizedStored = normalizePath(stored ?? '');
      if (stored && normalizedStored !== stored) {
        localStorage.setItem('personal-control-active-tab', normalizedStored);
        setCurrentPath(normalizedStored);
      }
    }
  }, []);

  const navigate = useCallback((path) => {
    const cleanPath = normalizePath(path.replace(/^\//, ''));
    if (window.location.pathname.replace(/^\//, '') !== cleanPath) {
      window.history.pushState(null, '', `/${cleanPath}`);
      setCurrentPath(cleanPath);
      localStorage.setItem('personal-control-active-tab', cleanPath);
    }
  }, []);

  /**
   * Navega para um módulo/tela, montando o caminho automaticamente.
   * Ex.: navigateTo('minhasfinancas', 'accounts', { id: 'abc' })
   */
  const navigateTo = useCallback((module, screen = null, params = {}) => {
    navigate(buildPath(module, screen, params));
  }, [navigate]);

  return { currentPath, route, navigate, navigateTo, parsePath, buildPath };
}
