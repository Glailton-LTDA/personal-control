import React, { createContext, useContext, useState } from 'react';
import { supabase } from '../lib/supabase';
import { deriveKey, decrypt, unwrapKey, unwrapKeyWithPrivateKey, importPrivateKey } from '../lib/encryption';

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

  const migrateToPlainText = async () => {
    console.log('[Migration] Starting Deep Universal Migration (v2)...');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const input = prompt('Digite sua senha principal (se você mudou de senha no passado, digite todas as senhas separadas por vírgula):');
      if (!input) return;
      
      const passwords = input.split(',').map(p => p.trim()).filter(Boolean);
      const email = user.email;
      const variations = [email.toLowerCase(), email.replace(/\./g, '').toLowerCase(), email];
      const salts = [...new Set(variations)];

      // 1. Recover ALL possible keys
      const { data: userKeys } = await supabase.from('user_keys').select('*');
      const { data: resKeys } = await supabase.from('resource_keys').select('*');
      
      const masterKeyPool = [];
      for (const pwd of passwords) {
        for (const salt of salts) {
          try {
            const mk = await deriveKey(pwd, salt);
            masterKeyPool.push(mk);
          } catch (e) { /* ignore */ } // eslint-disable-line no-unused-vars
        }
      }

      const keyPool = [...masterKeyPool];

      // Unwrap resource keys using all derived master keys
      for (const mk of masterKeyPool) {
        for (const rk of (resKeys || [])) {
          try {
            const unwrapped = await unwrapKey(rk.encrypted_key, mk);
            if (unwrapped) keyPool.push(unwrapped);
          } catch (e) { /* ignore */ } // eslint-disable-line no-unused-vars
        }
      }

      // Add phantom private keys and their associated resource keys
      for (const uk of (userKeys || [])) {
        for (const mk of masterKeyPool) {
          try {
            const pkJwk = await decrypt(uk.encrypted_private_key, mk);
            if (pkJwk && !pkJwk.startsWith('[Dec')) {
              try {
                const pk = await importPrivateKey(pkJwk);
                // Try to unwrap resource keys with this private key
                for (const rk of (resKeys || []).filter(r => r.encryption_method === 'PUBLIC_KEY')) {
                  try {
                    const unwrapped = await unwrapKeyWithPrivateKey(rk.encrypted_key, pk);
                    if (unwrapped) keyPool.push(unwrapped);
                  } catch (e) { /* ignore */ } // eslint-disable-line no-unused-vars
                }
              } catch (e) { /* ignore */ } // eslint-disable-line no-unused-vars
            }
          } catch (e) { /* ignore */ } // eslint-disable-line no-unused-vars
        }
      }

      // Deduplicate keys by exporting them to base64 for comparison
      const keyMap = new Map();
      for (const key of keyPool) {
        try {
          const b64 = await crypto.subtle.exportKey('raw', key).then(raw => btoa(String.fromCharCode(...new Uint8Array(raw))));
          keyMap.set(b64, key);
        } catch (e) { /* ignore */ } // eslint-disable-line no-unused-vars
      }
      const uniqueKeys = Array.from(keyMap.values());
      console.log(`[Migration] Key Pool Ready: ${uniqueKeys.length} unique keys found.`);

      const tables = [
        { name: 'trips', fields: ['title', 'cities', 'countries', 'participants', 'daily_limits', 'hotels', 'transports'] },
        { name: 'trip_itinerary', fields: ['coordinates'] },
        { name: 'trip_expenses', fields: ['description', 'notes', 'location', 'paid_by'] },
        { name: 'trip_categories', fields: ['name'] },
        { name: 'finances', fields: ['description', 'paid_by', 'tags', 'notes'] },
        { name: 'finance_categories', fields: ['name'] },
        { name: 'finance_responsibles', fields: ['name'] },
        { name: 'finance_config', fields: ['value'] },
        { name: 'cars', fields: ['name', 'plate', 'brand', 'model'] },
        { name: 'car_maintenance', fields: ['description', 'place', 'notes'] },
        { name: 'car_shares', fields: ['shared_with'] },
        { name: 'car_service_templates', fields: ['name', 'description'] },
        { name: 'investment_accounts', fields: ['name'] },
        { name: 'investment_records', fields: ['description', 'institution', 'notes'] },
        { name: 'investment_institutions', fields: ['name'] },
        { name: 'investment_account_types', fields: ['name'] },
        { name: 'notification_settings', fields: ['email'] }
      ];

      const deepProcess = async (val) => {
        if (!val) return val;

        if (typeof val === 'string' && val.startsWith('enc:v1:')) {
          for (const key of uniqueKeys) {
            const dec = await decrypt(val, key);
            if (dec && !dec.startsWith('[Dec')) return dec;
          }
          return val; // Could not decrypt
        }

        if (Array.isArray(val)) {
          const newArr = [];
          let changed = false;
          for (const item of val) {
            const processed = await deepProcess(item);
            if (processed !== item) changed = true;
            newArr.push(processed);
          }
          return changed ? newArr : val;
        }

        if (typeof val === 'object' && val !== null) {
          const newObj = {};
          let changed = false;
          for (const [k, v] of Object.entries(val)) {
            const processed = await deepProcess(v);
            if (processed !== v) changed = true;
            newObj[k] = processed;
          }
          return changed ? newObj : val;
        }

        return val;
      };

      for (const table of tables) {
        console.log(`[Migration] Scanning table: ${table.name}`);
        const { data: records, error: fetchError } = await supabase.from(table.name).select('*');
        if (fetchError) {
          console.warn(`[Migration] Could not scan ${table.name}:`, fetchError.message);
          continue;
        }
        
        for (const record of (records || [])) {
          let needsUpdate = false;
          const updatedData = {};

          for (const field of table.fields) {
            if (record[field] === undefined) continue;
            const processed = await deepProcess(record[field]);
            if (processed !== record[field]) {
              updatedData[field] = processed;
              needsUpdate = true;
            }
          }

          if (needsUpdate) {
            const { error: updateError } = await supabase.from(table.name).update(updatedData).eq('id', record.id);
            if (updateError) {
              console.error(`[Migration] Failed to update ${table.name} record ${record.id}:`, updateError.message);
            } else {
              console.log(`[Migration] Restored record ${record.id} in ${table.name}`);
            }
          }
        }
      }
      alert('Resgate profundo concluído! Verifique seus dados.');
    } catch (e) {
      console.error('[Migration] Critical Error:', e);
      alert('Erro crítico no resgate: ' + e.message);
    }
  };

  const value = {
    isReady,
    isUnlocked,
    encryptData,
    decryptData,
    encryptObject,
    decryptObject,
    migrateToPlainText,
    // Métodos legados que não fazem mais nada
    unlock: async () => true,
    lock: () => {},
    getResourceKey: async () => null,
    shareResourceKey: async () => true
  };

  return (
    <EncryptionContext.Provider value={value}>
      {children}
    </EncryptionContext.Provider>
  );
};
