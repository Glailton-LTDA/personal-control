import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import PullToRefresh from './components/PullToRefresh';
import { useTranslation } from 'react-i18next';
import { reconcilePushAccount, unsubscribeDevicePush } from './lib/push';


function App() {
  const { i18n } = useTranslation();
  const [session, setSession] = useState(null);
  const [isRecovering, setIsRecovering] = useState(false);

  useEffect(() => {
    // Detecta se é um link de recuperação no carregamento inicial
    if (window.location.hash.includes('type=recovery')) {
      setIsRecovering(true);
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecovering(true);
      }
      if (event === 'SIGNED_OUT') {
        unsubscribeDevicePush().catch(() => {});
        window.history.pushState(null, '', '/');
      }
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id;
  useEffect(() => {
    if (userId) reconcilePushAccount(userId, i18n.resolvedLanguage || i18n.language).catch(() => {});
  }, [userId, i18n.resolvedLanguage, i18n.language]);

  // Se estiver em modo de recuperação ou não tiver sessão, mostra Login
  if (isRecovering || !session) {
    return (
      <>
        <PullToRefresh />
        <Login 
          onLogin={(user) => setSession({ user })} 
          recoveryMode={isRecovering}
          onRecoveryComplete={() => {
            setIsRecovering(false);
            setSession(null); // Garante que saia da sessão após reset
            supabase.auth.signOut();
          }}
        />
      </>
    );
  }

  return (
    <>
      <PullToRefresh />
      <Dashboard key={session.user.id} user={session.user} />
    </>
  );
}

export default App;
