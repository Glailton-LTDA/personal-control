-- Existing owner policies and grants continue to protect both new fields.
begin;
alter table public.health_appointments
 add column address text not null default '' check(length(address)<=1000),
 add column follow_up_of uuid,
 add constraint health_appointments_follow_up_owner_fk
  foreign key(user_id,follow_up_of) references public.health_appointments(user_id,id),
 add constraint health_appointments_not_own_follow_up check(follow_up_of is null or follow_up_of<>id);
-- Supports bounded, owner-scoped follow-up history and the composite FK.
create index health_appointments_follow_up_idx
 on public.health_appointments(user_id,follow_up_of,starts_at,id);
commit;
