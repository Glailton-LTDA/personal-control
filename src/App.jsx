import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import Login from './components/Login';
import Dashboard from './components/Dashboard';

function App() {
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
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Se estiver em modo de recuperação ou não tiver sessão, mostra Login
  if (isRecovering || !session) {
    return (
      <Login 
        onLogin={(user) => setSession({ user })} 
        recoveryMode={isRecovering}
        onRecoveryComplete={() => {
          setIsRecovering(false);
          setSession(null); // Garante que saia da sessão após reset
          supabase.auth.signOut();
        }}
      />
    );
  }

  return <Dashboard user={session.user} />;
}

export default App;
