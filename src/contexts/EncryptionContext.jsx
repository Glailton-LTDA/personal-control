import React, { createContext, useContext, useState, useEffect } from 'react';
import { initializeEncryptionKey, encrypt, decrypt, isEncrypted } from '../lib/encryption';
import toast from 'react-hot-toast';

const EncryptionContext = createContext();

export function EncryptionProvider({ children, user }) {
  const [masterKey, setMasterKey] = useState(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [showUnlockModal, setShowUnlockModal] = useState(false);

  // Auto-show unlock modal if user is logged in but key is not set
  useEffect(() => {
    if (user && !masterKey && window.localStorage.getItem('pc_e2e_test') !== 'true') {
      setShowUnlockModal(true);
    }
  }, [user, masterKey]);

  const unlock = async (password) => {
    try {
      if (!user?.email) throw new Error('Usuário não identificado');
      const key = await initializeEncryptionKey(password, user.email);
      setMasterKey(key);
      setIsUnlocked(true);
      setShowUnlockModal(false);
      toast.success('Dados descriptografados com sucesso!');
      return true;
    } catch {
      toast.error('Senha incorreta ou erro na geração da chave');
      return false;
    }
  };

  const lock = () => {
    setMasterKey(null);
    setIsUnlocked(false);
  };

  const encryptObject = async (obj, fields) => {
    if (!obj || !masterKey) return obj;

    // Transparently handle arrays of objects
    if (Array.isArray(obj)) {
      return await Promise.all(obj.map(item => encryptObject(item, fields)));
    }
    
    // Recursive function to handle nested paths with wildcards
    const process = async (current, pathParts) => {
      if (current === null || current === undefined) return current;
      
      const [head, ...tail] = pathParts;
      
      if (head === '*') {
        if (Array.isArray(current)) {
          return await Promise.all(current.map(item => process(item, tail)));
        }
        return current;
      }
      
      if (tail.length === 0) {
        // We reached the target field
        if (current[head] !== undefined && current[head] !== null && typeof current[head] === 'string' && current[head].trim() !== '') {
          return { ...current, [head]: await encryptData(current[head]) };
        }
        return current;
      }
      
      // We are in the middle of the path
      if (current[head] !== undefined && current[head] !== null) {
        const processedValue = await process(current[head], tail);
        return { ...current, [head]: processedValue };
      }
      
      return current;
    };

    let result = obj;
    for (const fieldPath of fields) {
      result = await process(result, fieldPath.split('.'));
    }
    return result;
  };

  const decryptObject = async (obj, fields) => {
    if (!obj || !masterKey) return obj;

    // Transparently handle arrays of objects
    if (Array.isArray(obj)) {
      return await Promise.all(obj.map(item => decryptObject(item, fields)));
    }
    
    const process = async (current, pathParts) => {
      if (current === null || current === undefined) return current;
      
      const [head, ...tail] = pathParts;
      
      if (head === '*') {
        if (Array.isArray(current)) {
          return await Promise.all(current.map(item => process(item, tail)));
        }
        return current;
      }
      
      if (tail.length === 0) {
        if (current[head] && isEncrypted(current[head])) {
          return { ...current, [head]: await decryptData(current[head]) };
        }
        // Handle array of strings case if path ends in *
        if (head === '' && typeof current === 'string' && isEncrypted(current)) {
           return await decryptData(current);
        }
        return current;
      }
      
      if (current[head] !== undefined && current[head] !== null) {
        const processedValue = await process(current[head], tail);
        return { ...current, [head]: processedValue };
      }
      
      return current;
    };

    // Special case for array of strings or simple values
    if (Array.isArray(obj) && fields.length === 1 && fields[0] === '*') {
        return await Promise.all(obj.map(async item => {
            if (typeof item === 'string' && isEncrypted(item)) return await decryptData(item);
            return item;
        }));
    }

    let result = obj;
    for (const fieldPath of fields) {
      result = await process(result, fieldPath.split('.'));
    }
    return result;
  };

  const encryptData = async (data) => {
    if (!masterKey) return data;
    return await encrypt(data, masterKey);
  };

  const decryptData = async (data) => {
    if (!masterKey) return data;
    return await decrypt(data, masterKey);
  };

  return (
    <EncryptionContext.Provider value={{
      masterKey,
      isUnlocked,
      unlock,
      lock,
      encryptData,
      decryptData,
      decryptObject,
      encryptObject,
      showUnlockModal,
      setShowUnlockModal
    }}>
      {children}
      {showUnlockModal && <UnlockModal onUnlock={unlock} onCancel={() => setShowUnlockModal(false)} />}
    </EncryptionContext.Provider>
  );
}

function UnlockModal({ onUnlock, onCancel }) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const success = await onUnlock(password);
    setLoading(false);
    if (success) setPassword('');
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(15, 23, 42, 0.9)',
      backdropFilter: 'blur(12px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, padding: '1rem'
    }}>
      <div className="glass-card" style={{
        maxWidth: '400px', width: '100%', padding: '2rem',
        border: '1px solid var(--glass-border)', textAlign: 'center'
      }}>
        <div style={{ 
          width: '60px', height: '60px', borderRadius: '18px', 
          background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 1.5rem'
        }}>
           <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
        </div>
        <h2 style={{ color: 'var(--text-main)', marginBottom: '0.5rem' }}>Acesso Seguro</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '2rem' }}>
          Digite sua senha mestre para descriptografar seus dados financeiros locais.
        </p>
        
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <input 
            type="password"
            autoFocus
            required
            data-testid="master-password-input"
            className="glass-input"
            placeholder="Senha Mestre"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: '100%', padding: '1rem', textAlign: 'center', fontSize: '1.2rem' }}
          />
          <button 
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{ width: '100%', padding: '1rem', fontWeight: 'bold' }}
          >
            {loading ? 'Derivando chave...' : 'Desbloquear Dados'}
          </button>
          <button 
            type="button"
            onClick={onCancel}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem' }}
          >
            Apenas visualizar dados (bloqueados)
          </button>
        </form>
      </div>
    </div>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useEncryption = () => useContext(EncryptionContext);
