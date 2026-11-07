import { describe,it,expect } from 'vitest';
import { buildCsv } from './mfReports';
describe('CSV financeiro e fórmulas de planilha',()=>{
 it.each(['=1+1','+SUM(1,2)','@SUM(1,2)','-1+2','\t=1+1','\u0000=1+1'])('neutraliza texto %s',description=>{
  expect(buildCsv([{description,amount:10}])).toContain(`"'${description}"`);
 });
 it('mantém estornos negativos numéricos e escapa aspas',()=>{
  const csv=buildCsv([{description:'Teste "seguro"',amount:-12.3}]);
  expect(csv).toContain('"-12,30"');expect(csv).toContain('"Teste ""seguro"""');
 });
});
