import React, { createContext, useContext, useState } from 'react';

/**
 * ATENÇÃO: A criptografia foi REMOVIDA permanentemente para garantir a estabilidade do sistema.
 * Este contexto agora serve apenas como um "No-Op" para manter a compatibilidade.
 */

const EncryptionContext = createContext(null);

export const useEncryption = () => {
  const context = useContext(EncryptionContext);
  if (!context) {
    throw new Error('useEncryption must be used within an EncryptionProvider');
  }
  return context;
};

export const EncryptionProvider = ({ children }) => {
  // Estado fixo: sempre pronto e desbloqueado
  const [isReady] = useState(true);
  const [isUnlocked] = useState(true);

  // Funções pass-through (retornam o dado original sem alterações)
  const encryptData = async (data) => data;
  const decryptData = async (data) => data;
  const encryptObject = (obj) => obj;
  const decryptObject = (obj) => obj;

  const value = {
    isReady,
    isUnlocked,
    encryptData,
    decryptData,
    encryptObject,
    decryptObject,
    unlock: async () => true,
    lock: () => {},
    getResourceKey: async () => null,
    shareResourceKey: async () => true,
    migrateToPlainText: async () => {
      alert('O sistema já está operando totalmente em texto plano.');
    }
  };

  return (
    <EncryptionContext.Provider value={value}>
      {children}
    </EncryptionContext.Provider>
  );
};

