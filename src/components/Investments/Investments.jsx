import React, { useState, useEffect } from 'react';
import InvestmentDashboard from './InvestmentDashboard';
import InvestmentList from './InvestmentList';
import InvestmentSettings from './InvestmentSettings';
import { supabase } from '../../lib/supabase';

export default function Investments({ user, refreshKey, mode }) {
  const [key, setKey] = useState(0);

  useEffect(() => {
    setKey(prev => prev + 1);
  }, [refreshKey, mode]);

  return (
    <div key={key}>
      {mode === 'dashboard' && <InvestmentDashboard user={user} />}
      {mode === 'list' && <InvestmentList user={user} />}
      {mode === 'settings' && <InvestmentSettings user={user} />}
    </div>
  );
}
