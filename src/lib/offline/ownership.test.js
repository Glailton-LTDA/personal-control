import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { db } from './db';
import { setOfflineIdentity } from './owner';
import { mfSelect, mfSelectAll, mfMutate, clearMfCache } from './mfOffline';
import { SyncEngine } from './SyncEngine';

beforeEach(async () => {
  setOfflineIdentity('A');
  Object.defineProperty(navigator,'onLine',{ configurable:true,value:false });
  await db.mf_accounts.clear(); await db.sync_queue.clear();
  await db.mf_accounts.bulkPut([{id:'a',user_id:'A',name:'A'},{id:'b',user_id:'B',name:'B'}]);
});
afterEach(() => { Object.defineProperty(navigator,'onLine',{ configurable:true,value:true }); setOfflineIdentity(null); });

describe('isolamento offline entre contas e preservação de dados', () => {
  it('seleciona apenas o usuário atual, nos dois caminhos de leitura', async () => {
    const network=vi.fn();
    expect((await mfSelect('mf_accounts',network)).data.map(r=>r.id)).toEqual(['a']);
    setOfflineIdentity('B');
    expect((await mfSelectAll('mf_accounts',network)).data.map(r=>r.id)).toEqual(['b']);
    expect(network).not.toHaveBeenCalled();
  });
  it('logout bloqueia leituras sem apagar dados não sincronizados', async () => {
    setOfflineIdentity(null);
    await expect(mfSelect('mf_accounts',vi.fn())).rejects.toThrow('offline_auth_required');
    expect(await db.mf_accounts.count()).toBe(2);
  });
  it('não modifica nem remove registros de outro usuário', async () => {
    await expect(mfMutate({table:'mf_accounts',action:'update',id:'b',payload:{name:'inválido'},run:vi.fn()})).rejects.toThrow('offline_owner_mismatch');
    await expect(mfMutate({table:'mf_accounts',action:'delete',id:'b',run:vi.fn()})).rejects.toThrow('offline_owner_mismatch');
    expect((await db.mf_accounts.get('b')).name).toBe('B');
  });
  it('fila pertence ao autor e outro engine não a envia nem a descarta', async () => {
    await mfMutate({table:'mf_accounts',action:'delete',id:'a',run:vi.fn()});
    const entry=(await db.sync_queue.toArray())[0];
    expect(entry.owner_id).toBe('A');
    setOfflineIdentity('B');
    const engine=new SyncEngine('B',{providers:[]});engine._isOnline=true;
    const send=vi.spyOn(engine,'_processQueueEntry').mockResolvedValue();
    expect(await engine.drainQueue()).toBe(0);
    expect(send).not.toHaveBeenCalled();expect(await db.sync_queue.count()).toBe(1);
    engine.destroy();
  });
  it('engine antigo para ao trocar a sessão; fila sem dono fica preservada', async () => {
    await db.sync_queue.bulkAdd([
      {table_name:'mf_accounts',owner_id:'A',record_id:'a',action:'delete',attempts:0},
      {table_name:'mf_accounts',record_id:'unknown',action:'delete',attempts:0},
    ]);
    const engine=new SyncEngine('A',{providers:[]});engine._isOnline=true;
    const send=vi.spyOn(engine,'_processQueueEntry').mockResolvedValue();
    setOfflineIdentity('B');await engine.drainQueue();expect(send).not.toHaveBeenCalled();
    setOfflineIdentity('A');await engine.drainQueue();expect(send).toHaveBeenCalledTimes(1);
    expect((await db.sync_queue.toArray())[0].record_id).toBe('unknown');engine.destroy();
  });
  it('não limpa cache com escritas pendentes', async () => {
    await mfMutate({table:'mf_accounts',action:'update',id:'a',payload:{name:'pendente'},run:vi.fn()});
    await expect(clearMfCache()).rejects.toThrow('mf_pending_offline_changes');
    expect((await db.mf_accounts.get('a')).name).toBe('pendente');
  });
  it('falha ao enfileirar reverte a escrita local inteira', async () => {
    const add=vi.spyOn(db.sync_queue,'add').mockRejectedValueOnce(new Error('quota'));
    await expect(mfMutate({table:'mf_accounts',action:'update',id:'a',payload:{name:'não salvar'},run:vi.fn()})).rejects.toThrow('quota');
    expect((await db.mf_accounts.get('a')).name).toBe('A');add.mockRestore();
  });
  it('uma leitura em andamento não retorna dados após a sessão mudar', async () => {
    const where=vi.spyOn(db.mf_accounts,'where').mockReturnValueOnce({equals:()=>({toArray:async()=>{setOfflineIdentity('B');return [{id:'a',user_id:'A'}];}})});
    await expect(mfSelect('mf_accounts',vi.fn())).rejects.toThrow('offline_session_changed');
    where.mockRestore();
  });

});
