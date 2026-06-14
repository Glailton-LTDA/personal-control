import { useState, useCallback } from 'react';

const SESSION_KEY = 'music-session-state';

function readSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeSession(patch) {
  try {
    const current = readSession();
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...current, ...patch }));
  } catch {
    // quota exceeded ou private mode — silencioso
  }
}

/**
 * Retorna um state com getter/setter que persiste no sessionStorage.
 * Restaura o valor salvo no mount; atualiza o sessionStorage a cada mudança.
 *
 * @param {string} key  - chave dentro do objeto salvo no sessionStorage
 * @param {*} defaultValue - valor padrão se não houver valor salvo
 */
export function useSessionState(key, defaultValue) {
  const [value, setValue] = useState(() => {
    const saved = readSession()[key];
    return saved !== undefined ? saved : defaultValue;
  });

  const setValueAndPersist = useCallback((updater) => {
    setValue(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      writeSession({ [key]: next });
      return next;
    });
  }, [key]);

  return [value, setValueAndPersist];
}

/**
 * Persiste um valor pontualmente no sessionStorage sem criar state.
 * Útil para gravar informações derivadas de outras fontes (ex: selectedSong id).
 */
export function persistMusicSession(patch) {
  writeSession(patch);
}

/**
 * Limpa toda a sessão salva do módulo Music.
 */
export function clearMusicSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    //
  }
}
