import React, { createContext, useContext, useState } from 'react';

/**
 * ATENÇÃO: A criptografia foi DESATIVADA permanentemente para garantir a estabilidade do sistema.
 * Este contexto agora serve apenas como um "No-Op" para manter a compatibilidade com o restante do código.
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
  // Sempre pronto e sempre desbloqueado
  const [isReady] = useState(true);
  const [isUnlocked] = useState(true);

  // Funções de identidade (não fazem nada, apenas retornam o dado original)
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
    // Métodos legados que não fazem mais nada
    unlock: async () => true,
    lock: () => {},
    getResourceKey: async () => null
  };

  return (
    <EncryptionContext.Provider value={value}>
      {children}
    </EncryptionContext.Provider>
  );
};
