import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import packageJson from './package.json' with { type: 'json' }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.PACKAGE_VERSION': JSON.stringify(packageJson.version)
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('/node_modules/')) return;
          if (/\/node_modules\/(react|react-dom)\//.test(id)) return 'react-vendor';
          if (id.includes('/node_modules/recharts/')) return 'recharts-vendor';
          if (id.includes('/node_modules/@supabase/')) return 'supabase-vendor';
          if (/\/node_modules\/(lucide-react|framer-motion)\//.test(id)) return 'ui-vendor';
        }
      }
    }
  }
})
