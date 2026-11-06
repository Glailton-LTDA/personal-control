import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import AppToaster from './components/AppToaster'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import './i18n'
import App from './App.jsx'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 1000 * 60 * 5, // 5 minutos
    },
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
    <AppToaster />
  </StrictMode>,
)

// PWA: registra o service worker apenas em produção (dev/E2E sem SW).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* indisponível (ex.: sem HTTPS) — segue sem PWA */
    });
  })
}
