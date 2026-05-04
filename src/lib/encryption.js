/**
 * Encryption Service for PersonalControl
 * Uses Web Crypto API (AES-GCM 256)
 * Zero-knowledge: Keys never leave the browser memory.
 */

const ENCRYPTION_PREFIX = 'enc:v1:';

/**
 * Derives a crypto key from a master password and salt.
 */
async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(salt),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts a string value.
 * Returns: prefix + iv(base64) + ciphertext(base64)
 */
export async function encrypt(value, key) {
  if (!value || typeof value !== 'string') return value;
  if (!key) return value;
  
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(value)
  );

  const ivBase64 = btoa(String.fromCharCode(...iv));
  const cipherBase64 = btoa(String.fromCharCode(...new Uint8Array(ciphertext)));
  
  return `${ENCRYPTION_PREFIX}${ivBase64}:${cipherBase64}`;
}

/**
 * Decrypts a prefixed encrypted string.
 */
export async function decrypt(encryptedValue, key) {
  if (!encryptedValue || typeof encryptedValue !== 'string') return encryptedValue;
  if (!encryptedValue.startsWith(ENCRYPTION_PREFIX)) return encryptedValue;
  if (!key) {
    console.warn('Decryption skipped: Key is null or undefined');
    return '[Encrypted]';
  }
  if (!(key instanceof CryptoKey)) {
    console.error('Decryption failed: Provided key is not a CryptoKey instance', key);
    return '[Encryption Error: Invalid Key]';
  }

  try {
    const parts = encryptedValue.substring(ENCRYPTION_PREFIX.length).split(':');
    if (parts.length !== 2) return encryptedValue;

    const iv = new Uint8Array(atob(parts[0]).split('').map(c => c.charCodeAt(0)));
    const ciphertext = new Uint8Array(atob(parts[1]).split('').map(c => c.charCodeAt(0)));

    const dec = new TextDecoder();
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    return dec.decode(decrypted);
  } catch (e) {
    console.error('Decryption failed:', e);
    return '[Decryption Error]';
  }
}

/**
 * Utility to initialize a session key from a password and user email (as salt).
 */
export async function initializeEncryptionKey(password, email) {
  return await deriveKey(password, email.toLowerCase());
}

/**
 * Checks if a value is encrypted.
 */
export function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(ENCRYPTION_PREFIX);
}

/**
 * Exports a crypto key to a Base64 string.
 */
export async function exportKeyToBase64(key) {
  const exported = await crypto.subtle.exportKey('raw', key);
  return btoa(String.fromCharCode(...new Uint8Array(exported)));
}

/**
 * Imports a crypto key from a Base64 string.
 */
export async function importKeyFromBase64(base64Key) {
  const binaryKey = new Uint8Array(atob(base64Key).split('').map(c => c.charCodeAt(0)));
  return crypto.subtle.importKey(
    'raw',
    binaryKey,
    'AES-GCM',
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Generates a random AES-256 key for a specific resource.
 */
export async function generateResourceKey() {
  return await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Generates an asymmetric RSA-OAEP key pair for a user.
 */
export async function generateAsymmetricKeyPair() {
  return await crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Wraps an AES key using a Public Key (RSA-OAEP).
 */
export async function wrapKeyWithPublicKey(keyToWrap, publicKey) {
  const exportedKey = await crypto.subtle.exportKey('raw', keyToWrap);
  const wrapped = await crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    publicKey,
    exportedKey
  );
  return btoa(String.fromCharCode(...new Uint8Array(wrapped)));
}

/**
 * Unwraps an AES key using a Private Key (RSA-OAEP).
 */
export async function unwrapKeyWithPrivateKey(wrappedKeyBase64, privateKey) {
  const wrapped = new Uint8Array(atob(wrappedKeyBase64).split('').map(c => c.charCodeAt(0)));
  const unwrapped = await crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    privateKey,
    wrapped
  );
  return await crypto.subtle.importKey(
    'raw',
    unwrapped,
    'AES-GCM',
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Exports a Public Key to JWK string.
 */
export async function exportPublicKey(key) {
  const exported = await crypto.subtle.exportKey('jwk', key);
  return JSON.stringify(exported);
}

/**
 * Imports a Public Key from JWK string.
 */
export async function importPublicKey(jwkString) {
  const jwk = JSON.parse(jwkString);
  return await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    true,
    ['encrypt']
  );
}

/**
 * Exports a Private Key to JWK string (should be encrypted before storage!).
 */
export async function exportPrivateKey(key) {
  const exported = await crypto.subtle.exportKey('jwk', key);
  return JSON.stringify(exported);
}

/**
 * Imports a Private Key from JWK string.
 */
export async function importPrivateKey(jwkString) {
  const jwk = JSON.parse(jwkString);
  return await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    true,
    ['decrypt']
  );
}
