import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import PullToRefresh from './components/PullToRefresh';
import { useQueryClient } from '@tanstack/react-query';
import { setOfflineIdentity } from './lib/offline/owner';


function App() {
  const queryClient = useQueryClient();
  const [session, setSession] = useState(null);
  const [isRecovering, setIsRecovering] = useState(false);

  useEffect(() => {
    // Detecta se é um link de recuperação no carregamento inicial
    if (window.location.hash.includes('type=recovery')) {
      setIsRecovering(true);
    }

    let currentUser;
    let authEventReceived = false;
    let active = true;
    const acceptSession = (next) => {
      const nextUser = next?.user?.id || null;
      setOfflineIdentity(nextUser);
      if (currentUser !== undefined && currentUser !== nextUser) queryClient.clear();
      currentUser = nextUser;
      setSession(next);
    };
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (active && !authEventReceived) acceptSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      authEventReceived = true;
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecovering(true);
      }
      if (event === 'SIGNED_OUT') {
        window.history.pushState(null, '', '/');
      }
      acceptSession(session);
    });

    return () => { active = false; subscription.unsubscribe(); };
  }, [queryClient]);

  // Se estiver em modo de recuperação ou não tiver sessão, mostra Login
  if (isRecovering || !session) {
    return (
      <>
        <PullToRefresh />
        <Login
          onLogin={(user) => { setOfflineIdentity(user.id); setSession({ user }); }}
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
      <Dashboard user={session.user} />
    </>
  );
}

export default App;
