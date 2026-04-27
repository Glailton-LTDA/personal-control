import React, { useState, useEffect } from 'react';
import InvestmentDashboard from './InvestmentDashboard';
import InvestmentList from './InvestmentList';
import InvestmentSettings from './InvestmentSettings';

export default function Investments({ user, refreshKey, mode, showValues = true }) {
  const [key, setKey] = useState(0);

  useEffect(() => {
    setKey(prev => prev + 1);
  }, [refreshKey, mode]);

  return (
    <div key={key}>
      {mode === 'dashboard' && <InvestmentDashboard user={user} showValues={showValues} />}
      {mode === 'list' && <InvestmentList user={user} showValues={showValues} />}
      {mode === 'settings' && <InvestmentSettings user={user} />}
    </div>
  );
}
