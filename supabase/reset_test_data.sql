-- =============================================================================
-- 997 Laundry — wipe ALL cloud data and accounts (use only after testing, before the real upload)
-- Supabase → SQL Editor → paste → Run. The tables and security rules stay installed.
-- ⚠ Irreversible: deletes the shop, every record, the change history and every login account.
-- =============================================================================
begin;
delete from public.record_history;
delete from public.records;
delete from public.shop_counters;
delete from public.shop_members;
delete from public.shops;
delete from auth.users where email like '%@997laundry.app';
alter sequence public.records_seq restart with 1;
commit;
select (select count(*) from public.shops) as shops, (select count(*) from public.records) as records,
       (select count(*) from auth.users where email like '%@997laundry.app') as accounts;
