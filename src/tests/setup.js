import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
import React from 'react';

// Extends Vitest's expect with React Testing Library matchers
expect.extend(matchers);

// Runs cleanup after each test case
afterEach(() => {
  cleanup();
});

// Mock crypto for randomUUID
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = {
    randomUUID: () => 'test-uuid-' + Math.random().toString(36).substring(2, 9)
  };
}

// Global Mock for Lucide-React (Automated for ALL icons)
vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal();
  const MockIcon = (props) => React.createElement('div', { ...props });
  
  const mockIcons = {};
  // Automatically mock every capitalized export (Icons)
  Object.keys(actual).forEach(key => {
    if (typeof key === 'string' && key[0] === key[0].toUpperCase()) {
      mockIcons[key] = MockIcon;
    }
  });

  return {
    ...actual,
    ...mockIcons,
    __esModule: true,
  };
});

// Global Mock for Recharts
vi.mock('recharts', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    ResponsiveContainer: ({ children }) => React.createElement('div', { 
      style: { width: 800, height: 400 },
      'data-testid': 'responsive-container' 
    }, children),
  };
});

// Global Mock for Framer Motion
vi.mock('framer-motion', () => ({
  motion: { 
    div: ({ children, ...props }) => React.createElement('div', props, children),
    section: ({ children, ...props }) => React.createElement('section', props, children),
    header: ({ children, ...props }) => React.createElement('header', props, children),
    footer: ({ children, ...props }) => React.createElement('footer', props, children),
    button: ({ children, ...props }) => React.createElement('button', props, children),
    span: ({ children, ...props }) => React.createElement('span', props, children),
    nav: ({ children, ...props }) => React.createElement('nav', props, children),
    ul: ({ children, ...props }) => React.createElement('ul', props, children),
    li: ({ children, ...props }) => React.createElement('li', props, children),
    a: ({ children, ...props }) => React.createElement('a', props, children)
  },
  AnimatePresence: ({ children }) => children
}));

// Global Mock for Supabase
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
      getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'test-user', email: 'test@example.com' } }, error: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      update: vi.fn().mockResolvedValue({ data: null, error: null }),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: vi.fn(cb => Promise.resolve({ data: [], error: null }).then(cb)),
    })),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(() => Promise.resolve({ error: null })),
        getPublicUrl: vi.fn(() => ({ data: { publicUrl: '' } })),
      })),
    },
  },
}));

// Global Mock for EncryptionContext
const mockEncryption = {
  isUnlocked: true,
  masterKey: 'test-key',
  encryptData: vi.fn((data) => Promise.resolve(data)),
  decryptData: vi.fn((data) => Promise.resolve(data)),
  encryptObject: vi.fn((obj) => Promise.resolve(obj)),
  decryptObject: vi.fn((obj) => Promise.resolve(obj)),
  deriveKey: vi.fn(() => Promise.resolve(true)),
  clearMasterKey: vi.fn(),
  showUnlockModal: false,
  setShowUnlockModal: vi.fn()
};

vi.mock('../contexts/EncryptionContext', () => ({
  useEncryption: () => mockEncryption,
  EncryptionProvider: ({ children }) => children
}));