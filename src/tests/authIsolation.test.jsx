import React from 'react';
import { render,screen,act,waitFor } from '@testing-library/react';
import { describe,it,expect,vi,beforeEach } from 'vitest';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import App from '../App';
import { offlineIdentity } from '../lib/offline/owner';
const auth=vi.hoisted(()=>({listener:null,getSession:vi.fn()}));
vi.mock('../lib/supabase',()=>({supabase:{auth:{getSession:auth.getSession,onAuthStateChange:vi.fn((cb)=>{auth.listener=cb;return {data:{subscription:{unsubscribe:vi.fn()}}};})}}}));
vi.mock('../components/Dashboard',()=>({default:({user})=><div data-testid="dashboard-owner">{user.id}</div>}));
vi.mock('../components/Login',()=>({default:()=> <div>Login</div>}));
vi.mock('../components/PullToRefresh',()=>({default:()=>null}));
beforeEach(()=>{auth.listener=null;auth.getSession.mockResolvedValue({data:{session:{user:{id:'A'}}}});});
const mount=()=>{const client=new QueryClient();render(<QueryClientProvider client={client}><App/></QueryClientProvider>);return client;};
describe('sessão e cache em memória',()=>{
 it('logout bloqueia identidade offline e limpa cache; outra sessão assume apenas sua identidade',async()=>{
  const client=mount();await screen.findByTestId('dashboard-owner');
  client.setQueryData(['mf-accounts','A'],[{id:'private'}]);
  act(()=>auth.listener('SIGNED_OUT',null));
  expect(screen.getByText('Login')).toBeInTheDocument();
  expect(await offlineIdentity()).toBeNull();expect(client.getQueryData(['mf-accounts','A'])).toBeUndefined();
  act(()=>auth.listener('SIGNED_IN',{user:{id:'B'}}));
  expect(screen.getByTestId('dashboard-owner')).toHaveTextContent('B');expect(await offlineIdentity()).toBe('B');
 });
 it('resposta inicial atrasada não substitui uma sessão mais recente',async()=>{
  let resolve;auth.getSession.mockImplementation(()=>new Promise(r=>{resolve=r;}));
  mount();act(()=>auth.listener('SIGNED_IN',{user:{id:'B'}}));
  await act(async()=>{resolve({data:{session:{user:{id:'A'}}}});});
  await waitFor(()=>expect(screen.getByTestId('dashboard-owner')).toHaveTextContent('B'));
  expect(await offlineIdentity()).toBe('B');
 });
});
