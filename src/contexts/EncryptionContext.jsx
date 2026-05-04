import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { 
  initializeEncryptionKey, 
  encrypt, 
  decrypt, 
  isEncrypted, 
  exportKeyToBase64, 
  importKeyFromBase64,
  generateAsymmetricKeyPair,
  exportPublicKey,
  importPublicKey,
  exportPrivateKey,
  importPrivateKey,
  generateResourceKey,
  wrapKeyWithPublicKey,
  unwrapKeyWithPrivateKey
} from '../lib/encryption';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

const EncryptionContext = createContext();

export function EncryptionProvider({ children, user }) {
  const [masterKey, setMasterKey] = useState(null);
  const [publicKey, setPublicKey] = useState(null);
  const [privateKey, setPrivateKey] = useState(null);
  const resourceKeys = useRef({}); // Cache: { resourceId: CryptoKey }
  const pendingRequests = useRef({});
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [showUnlockModal, setShowUnlockModal] = useState(false);

  // Initialize Asymmetric Keys
  const initializeUserKeys = useCallback(async (currentMasterKey) => {
    if (!user || !currentMasterKey) return;
    
    try {
      const { data, error } = await supabase
        .from('user_keys')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
        console.error('Error fetching user keys:', error);
        return;
      }

      if (!data) {
        // Generate new keys
        const pair = await generateAsymmetricKeyPair();
        const pubStr = await exportPublicKey(pair.publicKey);
        const privJWK = await exportPrivateKey(pair.privateKey);
        const encryptedPriv = await encrypt(privJWK, currentMasterKey);
        
        const { error: insertError } = await supabase.from('user_keys').insert({
          user_id: user.id,
          public_key: pubStr,
          encrypted_private_key: encryptedPriv
        });

        if (insertError) throw insertError;
        
        setPublicKey(pair.publicKey);
        setPrivateKey(pair.privateKey);
      } else {
        // Load existing keys
        const pub = await importPublicKey(data.public_key);
        const privJWK = await decrypt(data.encrypted_private_key, currentMasterKey);
        
        if (privJWK.startsWith('[Decryption Error]')) {
          throw new Error('Falha ao descriptografar chave privada. Senha mestre pode estar incorreta.');
        }

        const priv = await importPrivateKey(privJWK);
        setPublicKey(pub);
        setPrivateKey(priv);
      }
    } catch (e) {
      console.error('Failed to initialize user keys:', e);
      toast.error('Erro ao carregar chaves de segurança.');
    }
  }, [user]);

  // Auto-show unlock modal or load from session
  useEffect(() => {
    const checkSession = async () => {
      const savedKey = sessionStorage.getItem('pc_master_key');
      if (savedKey && user && !masterKey) {
        try {
          const key = await importKeyFromBase64(savedKey);
          setMasterKey(key);
          await initializeUserKeys(key);
          setIsUnlocked(true);
          setShowUnlockModal(false);
          return;
        } catch (e) {
          console.error('Failed to import key from session', e);
          sessionStorage.removeItem('pc_master_key');
        }
      }

      if (user && !masterKey && window.localStorage.getItem('pc_e2e_test') !== 'true') {
        setShowUnlockModal(true);
      }
    };

    checkSession();
  }, [user, masterKey, initializeUserKeys]);

  const unlock = async (password) => {
    try {
      if (!user?.email) throw new Error('Usuário não identificado');
      const key = await initializeEncryptionKey(password, user.email);
      setMasterKey(key);
      
      await initializeUserKeys(key);

      const exported = await exportKeyToBase64(key);
      sessionStorage.setItem('pc_master_key', exported);

      setIsUnlocked(true);
      setShowUnlockModal(false);
      toast.success('Dados descriptografados com sucesso!');
      return true;
    } catch (e) {
      console.error('Unlock error:', e);
      toast.error('Senha incorreta ou erro na geração da chave');
      return false;
    }
  };

  const lock = () => {
    setMasterKey(null);
    setPublicKey(null);
    setPrivateKey(null);
    resourceKeys.current = {};
    setIsUnlocked(false);
    sessionStorage.removeItem('pc_master_key');
  };

  /**
   * Retrieves or generates a resource-specific encryption key.
   */
  const getResourceKey = useCallback(async (resourceId, resourceType = 'TRIP', options = { createIfMissing: false }) => {
    if (!resourceId || !user || !masterKey) return null;
    
    if (resourceKeys.current[resourceId]) return resourceKeys.current[resourceId];
    if (pendingRequests.current[resourceId]) return pendingRequests.current[resourceId];

    const fetchKey = async () => {
      try {
        console.log(`[Encryption] getResourceKey: Fetching key for ${resourceId}`);
        const { data: keyData, error } = await supabase
          .from('resource_keys')
          .select('*')
          .eq('resource_id', resourceId)
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) {
          console.error(`[Encryption] Error fetching resource key for ${resourceId}:`, error);
          return null;
        }

        if (keyData) {
          console.log(`[Encryption] Found key in DB for ${resourceId}. Method: ${keyData.encryption_method}`);
          try {
            if (keyData.encryption_method === 'PUBLIC_KEY' || !keyData.encryption_method) {
              if (!privateKey) {
                console.warn(`[Encryption] Private key missing, cannot unwrap key for ${resourceId}`);
                return null;
              }
              const key = await unwrapKeyWithPrivateKey(keyData.encrypted_key, privateKey);
              console.log(`[Encryption] Successfully unwrapped key for ${resourceId}`);
              resourceKeys.current[resourceId] = key;
              return key;
            } else if (keyData.encryption_method === 'MASTER_KEY') {
              console.log(`[Encryption] Attempting legacy MASTER_KEY decryption for ${resourceId}`);
              const keyBase64 = await decrypt(keyData.encrypted_key, masterKey);
              const key = await importKeyFromBase64(keyBase64);
              resourceKeys.current[resourceId] = key;
              return key;
            }
          } catch (unwrapErr) {
            console.error(`[Encryption] Failed to unwrap key for ${resourceId}:`, unwrapErr);
          }
        }

        if (options.createIfMissing && publicKey) {
          console.log(`[Encryption] Generating new PUBLIC_KEY resource key for ${resourceId}`);
          const newKey = await generateResourceKey();
          const wrapped = await wrapKeyWithPublicKey(newKey, publicKey);
          
          const { error: insertError } = await supabase.from('resource_keys').insert({
            resource_id: resourceId,
            resource_type: resourceType,
            user_id: user.id,
            encrypted_key: wrapped,
            encryption_method: 'PUBLIC_KEY'
          });

          if (insertError) {
            console.error(`[Encryption] Failed to save resource key:`, insertError);
          } else {
            resourceKeys.current[resourceId] = newKey;
            return newKey;
          }
        }
      } finally {
        delete pendingRequests.current[resourceId];
      }
      return null;
    };

    pendingRequests.current[resourceId] = fetchKey();
    return pendingRequests.current[resourceId];
  }, [user, masterKey, privateKey, publicKey]);

  /**
   * Encrypts a key for another user.
   */
  const shareResourceKey = async (resourceId, resourceType, targetEmail) => {
    try {
      const currentKey = await getResourceKey(resourceId, resourceType);
      if (!currentKey) throw new Error('Chave do recurso não encontrada');

      // 1. Get target's public key
      const { data, error } = await supabase.rpc('get_public_key_by_email', { p_email: targetEmail.toLowerCase() });
      if (error || !data || data.length === 0) {
        throw new Error('Usuário não encontrado ou não configurou chaves de segurança.');
      }

      const { user_id: targetUserId, public_key: targetPubKeyStr } = data[0];
      const targetPubKey = await importPublicKey(targetPubKeyStr);

      // 2. Wrap current key with target's public key
      const wrappedKey = await wrapKeyWithPublicKey(currentKey, targetPubKey);

      // 3. Save to resource_keys
      const { error: insertError } = await supabase.from('resource_keys').upsert({
        resource_id: resourceId,
        resource_type: resourceType,
        user_id: targetUserId,
        encrypted_key: wrappedKey,
        encryption_method: 'PUBLIC_KEY'
      }, { onConflict: 'resource_id,user_id' });

      if (insertError) throw insertError;
      return true;
    } catch (e) {
      console.error('Share resource key error:', e);
      toast.error(e.message || 'Erro ao compartilhar acesso seguro.');
      return false;
    }
  };

  const encryptObject = useCallback(async (obj, fields, options = {}) => {
    if (!obj) return obj;
    
    let activeKey = masterKey;
    if (options.resourceId) {
      const rKey = await getResourceKey(options.resourceId, options.resourceType, { createIfMissing: true });
      if (rKey) activeKey = rKey;
    }

    if (!activeKey) return obj;

    const processValue = async (val, pathParts) => {
      if (val === null || val === undefined) return val;

      if (pathParts.length === 0) {
        if (typeof val === 'string' && val.trim() !== '' && !isEncrypted(val)) {
          return await encrypt(val, activeKey);
        }
        if (Array.isArray(val)) {
          return await Promise.all(val.map(item => processValue(item, [])));
        }
        return val;
      }

      const [head, ...tail] = pathParts;
      if (head === '*') {
        if (Array.isArray(val)) {
          return await Promise.all(val.map(item => processValue(item, tail)));
        }
        return val;
      }

      if (typeof val !== 'object') return val;
      if (!val[head]) return val;

      return {
        ...val,
        [head]: await processValue(val[head], tail)
      };
    };

    let result = Array.isArray(obj) ? [...obj] : { ...obj };
    
    if (Array.isArray(result)) {
      return await Promise.all(result.map(async (item) => {
        let processedItem = { ...item };
        for (const fieldPath of fields) {
          processedItem = await processValue(processedItem, fieldPath.split('.'));
        }
        return processedItem;
      }));
    } else {
      for (const fieldPath of fields) {
        result = await processValue(result, fieldPath.split('.'));
      }
      return result;
    }
  }, [masterKey, getResourceKey]);

  const decryptObject = useCallback(async (obj, fields, options = {}) => {
    if (!obj) return obj;

    let resourceKey = null;
    if (options.resourceId) {
      resourceKey = await getResourceKey(options.resourceId, options.resourceType);
      if (!resourceKey) {
        console.warn(`[Decryption] No resource key for ${options.resourceId}, will use Master Key only.`);
      }
    }

    const activeKey = resourceKey || masterKey;
    if (!activeKey || !(activeKey instanceof CryptoKey)) {
      return obj;
    }

    const processValue = async (val, pathParts) => {
      if (val === null || val === undefined) return val;

      if (pathParts.length === 0) {
        if (typeof val === 'string' && isEncrypted(val.trim())) {
          const encryptedVal = val.trim();
          try {
            // Attempt 1: Use the primary active key (Resource Key or Master Key)
            let decrypted = await decrypt(encryptedVal, activeKey);
            
            // Handle double encryption if necessary
            let i = 0;
            while (isEncrypted(decrypted) && i < 2) {
              const next = await decrypt(decrypted, activeKey);
              if (next === decrypted) break;
              decrypted = next;
              i++;
            }
            return decrypted;
          } catch (e) {
            // FALLBACK: If Resource Key failed, try Master Key as a last resort
            if (resourceKey && masterKey && resourceKey !== masterKey) {
              try {
                console.log(`[Decryption] Resource key failed for ${options.resourceId}, trying Master Key fallback...`);
                return await decrypt(encryptedVal, masterKey);
              } catch (fallbackErr) {
                console.error(`[Decryption] Fallback failed for ${options.resourceId}:`, fallbackErr);
              }
            }
            console.error(`[Decryption] Critical failure for value:`, e);
            return '[Decryption Error]';
          }
        }
        if (Array.isArray(val)) {
          return await Promise.all(val.map(item => processValue(item, [])));
        }
        return val;
      }

      const [head, ...tail] = pathParts;
      if (head === '*') {
        if (Array.isArray(val)) {
          return await Promise.all(val.map(item => processValue(item, tail)));
        }
        return val;
      }

      if (typeof val !== 'object') return val;
      if (!val[head]) return val;

      return {
        ...val,
        [head]: await processValue(val[head], tail)
      };
    };

    let result = Array.isArray(obj) ? [...obj] : { ...obj };

    if (Array.isArray(result)) {
      return await Promise.all(result.map(async (item) => {
        let processedItem = { ...item };
        for (const fieldPath of fields) {
          processedItem = await processValue(processedItem, fieldPath.split('.'));
        }
        return processedItem;
      }));
    } else {
      for (const fieldPath of fields) {
        result = await processValue(result, fieldPath.split('.'));
      }
      return result;
    }
  }, [masterKey, getResourceKey]);

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
      shareResourceKey,
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
