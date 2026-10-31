-- =============================================================================
-- 997 Laundry — GO-LIVE RESET (start fresh with real work)
-- Supabase → project "997 Laundry" → SQL Editor → New query → paste ALL of this → Run.
--
-- REMOVES (test data): orders, customers, payments/balances, sold packages, held orders, shifts,
--   attendance, payroll, expenses, recurring expenses, inventory, purchases, suppliers, stock moves,
--   closings, activity log, every staff account (only the OWNER stays), order numbers restart at 1.
-- KEEPS: the owner account and password, prices and products, service on/off, add-ons,
--   package definitions, shop profile, branches, permissions, security rules.
--
-- SAFETY: everything is copied first into the private schema backup_997 (not reachable from the
--   website). supabase/golive_restore.sql puts it back. The whole script is one transaction:
--   if anything fails, nothing is changed.
-- BEFORE RUNNING: every device shows "☁ Synced ✓" (or is closed). Nobody works in the system.
-- =============================================================================
begin;

create schema if not exists backup_997;
revoke all on schema backup_997 from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then execute 'revoke all on schema backup_997 from anon, authenticated'; end if;
end $$;

do $$
declare
  v_shop uuid; v_owner uuid; v_owners int; v_tag text := to_char(now(), 'YYYYMMDD_HH24MISS');
  v_removed int; v_staff int;
  wipe text[] := array['orders','customers','ledger','customer_packages','suspended_orders','shifts','attendance','activity','audit',
                       'payroll','expenses','recurring_expenses','inventory','purchases','suppliers','stock_moves','closures'];
begin
  select count(*) into v_owners from public.shop_members where role = 'owner' and active;
  if v_owners <> 1 then raise exception 'expected exactly one active owner, found % — nothing changed', v_owners; end if;
  select shop_id, user_id into v_shop, v_owner from public.shop_members where role = 'owner' and active;

  -- 1) full backup (restorable with golive_restore.sql)
  execute format('create table backup_997.%I as select * from public.records', 'records_' || v_tag);
  execute format('create table backup_997.%I as select * from public.record_history', 'history_' || v_tag);
  execute format('create table backup_997.%I as select * from public.shop_members', 'members_' || v_tag);
  execute format('create table backup_997.%I as select * from public.shop_counters', 'counters_' || v_tag);
  execute format('create table backup_997.%I as select to_jsonb(u) as row from auth.users u where u.id in (select user_id from public.shop_members where role <> ''owner'') or (u.email like ''%%@997laundry.app'' and u.id <> %L)', 'users_' || v_tag, v_owner);
  if to_regclass('auth.identities') is not null then
    execute format('create table backup_997.%I as select to_jsonb(i) as row from auth.identities i where i.user_id in (select (row->>''id'')::uuid from backup_997.%I)', 'identities_' || v_tag, 'users_' || v_tag);
  end if;

  -- 2) remove test records. Marked "deleted" (not erased) so every open device removes its local copy on the next sync;
  --    the content is cleared from the cloud (the backup keeps it).
  alter table public.records disable trigger user;
  update public.records r
     set deleted = true, data = jsonb_build_object('id', r.record_id), version = r.version + 1,
         seq = nextval('public.records_seq'), updated_at = now(), updated_by = null
   where r.shop_id = v_shop and not r.deleted
     and (r.collection = any(wipe)
          or (r.collection = 'employees' and coalesce(r.data ->> 'cloudUserId', '') <> v_owner::text));
  get diagnostics v_removed = row_count;
  alter table public.records enable trigger user;
  delete from public.record_history h where h.shop_id = v_shop
     and (h.collection = any(wipe) or (h.collection = 'employees' and coalesce(h.data ->> 'cloudUserId', '') <> v_owner::text));

  -- 3) staff accounts (their logins are deleted so the same usernames can be created again)
  select count(*) into v_staff from public.shop_members where shop_id = v_shop and user_id <> v_owner;
  delete from auth.users where id in (select user_id from public.shop_members where user_id <> v_owner);
  delete from auth.users where email like '%@997laundry.app' and id <> v_owner;

  -- 4) order numbers start again at 1
  insert into public.shop_counters (shop_id, next_order) values (v_shop, 1)
    on conflict (shop_id) do update set next_order = 1;

  raise notice 'GO-LIVE RESET DONE: % test records removed, % staff accounts removed, backup tag %', v_removed, v_staff, v_tag;
end $$;

commit;

-- result: what is left (should be: owner 1, staff 0, orders 0, customers 0, next order 1, prices kept)
select
  (select count(*) from public.shop_members where role = 'owner') as owner_accounts,
  (select count(*) from public.shop_members where role <> 'owner') as staff_accounts,
  (select count(*) from public.records where collection = 'orders' and not deleted) as orders,
  (select count(*) from public.records where collection = 'customers' and not deleted) as customers,
  (select count(*) from public.records where collection = 'ledger' and not deleted) as payments,
  (select count(*) from public.records where collection = 'employees' and not deleted) as employee_records,
  (select next_order from public.shop_counters limit 1) as next_order_number,
  (select count(*) from public.records where collection = 'settings' and not deleted) as settings_kept,
  (select max(table_name) from information_schema.tables where table_schema = 'backup_997' and table_name like 'records_%') as backup_table;
