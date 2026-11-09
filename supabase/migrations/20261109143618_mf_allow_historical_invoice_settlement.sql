-- A proteção do histórico deve barrar o agendador, sem impedir o usuário
-- de quitar um espelho já existente quando sua fatura estiver atrasada.
-- UPDATE de status/data de efetivação mantém valor e vínculo da fatura.
create or replace function public.mf_block_historical_invoice_auto()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_month_start date := date_trunc('month', current_date)::date;
begin
  if new.invoice_close is null or new.invoice_close >= v_month_start then
    return new;
  end if;

  if new.notes in (
    'Ajuste de fatura (reajuste de valor)',
    'Agendado automaticamente (fatura)'
  ) then
    if tg_op = 'UPDATE' then
      if new.amount is not distinct from old.amount
         and new.invoice_close is not distinct from old.invoice_close
         and new.notes is not distinct from old.notes then
        return new;
      end if;
    end if;

    if new.notes = 'Ajuste de fatura (reajuste de valor)' then
      raise exception 'Agendador: fatura histórica não pode ser reajustada automaticamente';
    elsif tg_op = 'INSERT' then
      raise exception 'Agendador: pagamento de fatura histórica não pode ser criado automaticamente';
    else
      raise exception 'Agendador: pagamento de fatura histórica não pode ser alterado automaticamente';
    end if;
  end if;

  return new;
end;
$$;
