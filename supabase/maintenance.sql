-- =====================================================================
--  13 HEIGHTS MANAGEMENT PORTAL — MAINTENANCE CHARGES
--  (update for an existing database)
--  Paste this whole file into Supabase > SQL Editor and press "Run".
--  It only ADDS things. It is safe to run again and won't touch your data.
-- =====================================================================

-- ---------- 1. Monthly maintenance charge on each resident ----------
alter table public.residents add column if not exists maintenance_charge numeric(12,2) not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'residents_maintenance_charge_check') then
    alter table public.residents
      add constraint residents_maintenance_charge_check check (maintenance_charge >= 0);
  end if;
end $$;

-- ---------- 2. Allow 'maintenance' as a charge type ----------
-- Old 'utilities' rows (electricity bills already entered) are kept as they are
-- so your history stays correct; the portal just no longer adds new ones.
alter table public.charges drop constraint if exists charges_type_check;
alter table public.charges
  add constraint charges_type_check check (type in ('rent', 'maintenance', 'utilities', 'deposit', 'other'));

-- Only one maintenance charge per resident per month
create unique index if not exists one_maintenance_per_month
  on public.charges (resident_id, period) where type = 'maintenance';

-- ---------- 3. Add maintenance for every active resident for a month ----------
-- (skips anyone already charged, same as generate_monthly_rent)
create or replace function public.generate_monthly_maintenance(p_period date)
returns integer language plpgsql security invoker set search_path = public as $$
declare
  v_period date := date_trunc('month', p_period)::date;
  v_due_day int;
  v_count int;
begin
  if not public.is_approved() then
    raise exception 'Not allowed';
  end if;
  select due_day into v_due_day from public.settings where id = 1;

  insert into public.charges (resident_id, flat_id, type, description, amount, period, due_date)
  select r.id, r.flat_id, 'maintenance',
         'Maintenance - ' || to_char(v_period, 'FMMonth YYYY'),
         r.maintenance_charge, v_period, v_period + (coalesce(v_due_day, 1) - 1)
  from public.residents r
  where r.status = 'active'
    and r.maintenance_charge > 0
    and r.check_in <= (v_period + interval '1 month' - interval '1 day')::date
    and not exists (
      select 1 from public.charges c
      where c.resident_id = r.id and c.type = 'maintenance' and c.period = v_period
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
grant execute on function public.generate_monthly_maintenance(date) to authenticated;

-- ---------- 4. Refresh the residents view so it includes the new column ----------
drop view if exists public.residents_overview;
create view public.residents_overview with (security_invoker = true) as
select
  r.*,
  f.flat_no,
  f.floor,
  coalesce(c.total, 0)                                         as total_charges,
  coalesce(p.paid, 0)                                          as total_paid,
  coalesce(p.refunded, 0)                                      as total_refunded,
  coalesce(c.total, 0) - coalesce(p.paid, 0) + coalesce(p.refunded, 0) as balance,
  p.last_payment
from public.residents r
left join public.flats f on f.id = r.flat_id
left join (
  select resident_id, sum(amount) as total from public.charges group by resident_id
) c on c.resident_id = r.id
left join (
  select resident_id,
         sum(case when kind = 'payment' then amount else 0 end) as paid,
         sum(case when kind = 'refund'  then amount else 0 end) as refunded,
         max(case when kind = 'payment' then paid_on end)       as last_payment
  from public.payments group by resident_id
) p on p.resident_id = r.id;
grant select on public.residents_overview to authenticated;

-- ---------- 5. Portal name ----------
update public.settings set hostel_name = '13 Heights' where id = 1 and hostel_name = 'My Hostel';

-- Done!
