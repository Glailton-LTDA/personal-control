import base from './playwright.config.js';

// A dedicated dev server supplies only a fictional PUBLIC key. Tests stub the
// browser Push API and all remote calls; they never send a real notification.
export default {
  ...base,
  projects: base.projects.filter(project => project.name === 'chromium'),
  testIgnore: [],
  testMatch: '**/push.spec.js',
  use: { ...base.use, baseURL: 'http://127.0.0.1:5174', storageState: { cookies: [], origins: [] } },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5174 --strictPort',
    env: { VITE_VAPID_PUBLIC_KEY: 'AQID' },
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: false,
  },
};
