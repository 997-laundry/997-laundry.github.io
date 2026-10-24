-- Local security test for supabase/setup.sql. Run after auth_stub.sql + setup.sql on an empty database:
--   psql -d <db> -f supabase/test/security_test.sql
-- Prints PASS/FAIL lines; the runner (run.sh) fails if any FAIL appears.
\set QUIET on
\set VERBOSITY terse
set client_min_messages = notice;

create schema if not exists t;
grant usage on schema t to anon, authenticated;
create or replace function t.ok(p_name text, p_cond boolean) returns void language plpgsql as $$
begin raise notice '% %', case when coalesce(p_cond, false) then 'PASS' else 'FAIL' end, p_name; end $$;
create or replace function t.refused(p_name text, p_sql text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise notice 'FAIL % (was allowed)', p_name;
exception when others then raise notice 'PASS % (refused: %)', p_name, sqlerrm;
end $$;
create or replace function t.rows(p_name text, p_sql text, p_expected int) returns void language plpgsql as $$
declare n int;
begin
  execute p_sql; get diagnostics n = row_count;
  raise notice '% % (rows %)', case when n = p_expected then 'PASS' else 'FAIL' end, p_name, n;
exception when others then raise notice 'FAIL % (error: %)', p_name, sqlerrm;
end $$;
create or replace function t.runs(p_name text, p_sql text) returns void language plpgsql as $$
begin execute p_sql; raise notice 'PASS %', p_name;
exception when others then raise notice 'FAIL % (error: %)', p_name, sqlerrm;
end $$;
grant execute on all functions in schema t to anon, authenticated;

insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333333'), ('44444444-4444-4444-4444-444444444444'),
  ('55555555-5555-5555-5555-555555555555');

-- ---------- anonymous visitor ----------
set role anon;
select t.refused('anonymous visitor cannot read records', 'select * from public.records');
select t.refused('anonymous visitor cannot create a shop', $q$select public.create_shop('x')$q$);
reset role;

-- ---------- before the owner is named, nobody can create the shop ----------
update auth.users set email = 'owner@997laundry.app' where id = '11111111-1111-1111-1111-111111111111';
update auth.users set email = 'stranger@997laundry.app' where id = '55555555-5555-5555-5555-555555555555';
set role authenticated;
select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', false);
select t.refused('stranger cannot claim the shop before the owner links', $q$select public.create_shop('fake')$q$);
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select t.refused('even the owner cannot create it until named in shop_setup', $q$select public.create_shop('997')$q$);
select t.refused('the owner setting cannot be read or changed through the API', 'select * from public.shop_setup');
reset role;
insert into public.shop_setup (id, owner_email) values (1, 'owner@997laundry.app');

-- ---------- owner creates the shop and adds staff ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select t.ok('owner creates the shop', public.create_shop('997 Laundry', 'Owner') is not null);
select t.rows('owner adds manager, accountant, worker', $q$
  insert into public.shop_members (shop_id, user_id, role, display_name)
  select id, u, r, n from public.shops, (values ('22222222-2222-2222-2222-222222222222'::uuid, 'manager', 'Manager'),
    ('33333333-3333-3333-3333-333333333333'::uuid, 'accountant', 'Accountant'),
    ('44444444-4444-4444-4444-444444444444'::uuid, 'worker', 'Worker')) v(u, r, n)$q$, 3);
select t.rows('owner writes an order, an expense, an employee, settings', $q$
  insert into public.records (shop_id, collection, record_id, data)
  select id, c, rid, d::jsonb from public.shops, (values ('orders', 'o1', '{"total":1.5}'), ('expenses', 'e1', '{"amount":20}'),
    ('employees', 'emp1', '{"name":"W","salary":300}'), ('settings', '_', '{"urgentPercent":100}')) v(c, rid, d)$q$, 4);
select t.ok('new record starts at version 1, signed by the writer',
  (select version = 1 and updated_by = auth.uid() from public.records where record_id = 'o1'));
select t.refused('owner cannot deactivate the last owner', $q$update public.shop_members set active = false where role = 'owner'$q$);
reset role;
create table t.ctx as select id as shop from public.shops;
grant select on t.ctx to anon, authenticated;

-- ---------- outsider (signed up, not a member) ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', false);
select t.refused('outsider cannot create a second shop', $q$select public.create_shop('fake')$q$);
select t.ok('outsider sees no records', (select count(*) = 0 from public.records));
select t.ok('outsider sees no shop or members', (select count(*) = 0 from public.shops) and (select count(*) = 0 from public.shop_members));
select t.refused('outsider cannot write into the shop (knowing its id)', $q$insert into public.records (shop_id, collection, record_id, data) select shop, 'orders', 'x1', '{}' from t.ctx$q$);
select t.refused('outsider cannot add themselves as owner (knowing the shop id)', $q$insert into public.shop_members (shop_id, user_id, role) select shop, auth.uid(), 'owner' from t.ctx$q$);
select t.rows('outsider cannot change any membership', $q$update public.shop_members set role = 'worker'$q$, 0);
reset role;

-- ---------- worker ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', false);
select t.ok('worker reads orders and settings', (select count(*) = 2 from public.records where collection in ('orders', 'settings')));
select t.ok('worker cannot see expenses or payroll', (select count(*) = 0 from public.records where collection in ('expenses', 'payroll')));
select t.ok('worker sees staff names (needed to sign in and assign orders)', (select count(*) = 1 from public.records where collection = 'employees'));
select t.ok('worker gets a block of order numbers', public.reserve_order_numbers(20, 1) = 1);
select t.ok('next block never overlaps', public.reserve_order_numbers(20, 1) = 21);
select t.ok('block starts after the device''s highest number', public.reserve_order_numbers(5, 100) = 100);
select t.refused('worker cannot reset passwords', $q$select public.set_member_password('33333333-3333-3333-3333-333333333333', 'Newpass#2026')$q$);
select t.refused('worker cannot read the order counter directly', 'select * from public.shop_counters');
select t.rows('worker adds and removes a held cart', $q$insert into public.records (shop_id, collection, record_id, data) select id, 'suspended_orders', 's1', '{}' from public.shops$q$, 1);
select t.rows('worker may remove a held cart', $q$update public.records set deleted = true where record_id = 's1'$q$, 1);
select t.refused('worker cannot add an expense', $q$insert into public.records (shop_id, collection, record_id, data) select id, 'expenses', 'e2', '{}' from public.shops$q$);
select t.rows('worker adds an order', $q$insert into public.records (shop_id, collection, record_id, data, version, updated_by)
  select id, 'orders', 'o2', '{"total":0.4}', 99, '11111111-1111-1111-1111-111111111111' from public.shops$q$, 1);
select t.ok('client cannot fake version or author', (select version = 1 and updated_by = auth.uid() from public.records where record_id = 'o2'));
select t.rows('worker updates an order (version 1 → 2)', $q$update public.records set data = '{"total":1.6}' where record_id = 'o1' and version = 1$q$, 1);
select t.rows('stale update from another device is not applied', $q$update public.records set data = '{"total":9}' where record_id = 'o1' and version = 1$q$, 0);
select t.ok('order now at version 2 with the first device''s value', (select version = 2 and data->>'total' = '1.6' from public.records where record_id = 'o1'));
select t.ok('every change gets a higher change number', (select seq > (select max(seq) from public.records where record_id <> 'o1') from public.records where record_id = 'o1'));
select t.rows('worker cannot change settings (prices)', $q$update public.records set data = '{"urgentPercent":0}' where collection = 'settings'$q$, 0);
select t.refused('worker cannot delete records', $q$delete from public.records where record_id = 'o1'$q$);
select t.refused('worker cannot wipe the table', 'truncate public.records');
select t.refused('worker cannot mark records removed', $q$update public.records set deleted = true where record_id = 'o2'$q$);
select t.refused('records cannot be renamed', $q$update public.records set record_id = 'zz' where record_id = 'o2'$q$);
select t.refused('unknown collection refused', $q$insert into public.records (shop_id, collection, record_id, data) select id, 'hacks', 'h1', '{}' from public.shops$q$);
select t.rows('worker writes an audit entry', $q$insert into public.records (shop_id, collection, record_id, data) select id, 'audit', 'a1', '{"action":"login"}' from public.shops$q$, 1);
select t.ok('worker cannot read the audit log', (select count(*) = 0 from public.records where collection = 'audit'));
select t.ok('worker cannot read change history', (select count(*) = 0 from public.record_history));
select t.rows('worker cannot promote themselves', $q$update public.shop_members set role = 'owner' where user_id = auth.uid()$q$, 0);
select t.ok('worker is still a worker', (select role = 'worker' from public.shop_members where user_id = auth.uid()));
select t.refused('worker cannot add staff', $q$insert into public.shop_members (shop_id, user_id, role) select id, '55555555-5555-5555-5555-555555555555', 'worker' from public.shops$q$);
reset role;

-- ---------- accountant ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
select t.ok('accountant reads expenses and salaries', (select count(*) = 2 from public.records where collection in ('expenses', 'employees')));
select t.rows('accountant may remove an expense (voided purchase)', $q$update public.records set deleted = true where record_id = 'e1'$q$, 1);
select t.refused('accountant cannot reset passwords', $q$select public.set_member_password('44444444-4444-4444-4444-444444444444', 'Newpass#2026')$q$);
select t.rows('accountant cannot change prices', $q$update public.records set data = '{"urgentPercent":0}' where collection = 'settings'$q$, 0);
select t.refused('accountant cannot edit an audit entry', $q$update public.records set data = '{"action":"nothing happened"}' where collection = 'audit'$q$);
select t.ok('accountant reads the change history (order o1 has 2 versions)', (select count(*) = 2 from public.record_history where record_id = 'o1'));
select t.refused('history cannot be erased', 'delete from public.record_history');
reset role;

-- ---------- manager ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select t.refused('manager cannot create another owner', $q$insert into public.shop_members (shop_id, user_id, role) select id, '55555555-5555-5555-5555-555555555555', 'owner' from public.shops$q$);
select t.refused('manager cannot promote the worker to manager', $q$update public.shop_members set role = 'manager' where user_id = '44444444-4444-4444-4444-444444444444'$q$);
select t.runs('manager resets the worker''s password', $q$select public.set_member_password('44444444-4444-4444-4444-444444444444', 'Temp#2026pass')$q$);
select t.refused('manager cannot reset the owner''s password', $q$select public.set_member_password('11111111-1111-1111-1111-111111111111', 'Hacked#2026')$q$);
select t.rows('manager can deactivate the worker', $q$update public.shop_members set active = false where user_id = '44444444-4444-4444-4444-444444444444'$q$, 1);
select t.rows('manager can remove (soft) an order', $q$update public.records set deleted = true where record_id = 'o2'$q$, 1);
select t.rows('manager cannot edit the owner account', $q$update public.shop_members set display_name = 'x' where role = 'owner'$q$, 0);
reset role;
select t.ok('worker password stored as a bcrypt hash', (select encrypted_password like '$2%' and encrypted_password = extensions.crypt('Temp#2026pass', encrypted_password) from auth.users where id = '44444444-4444-4444-4444-444444444444'));

-- ---------- deactivated worker ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', false);
select t.ok('deactivated worker sees nothing', (select count(*) = 0 from public.records));
select t.refused('deactivated worker cannot write', $q$insert into public.records (shop_id, collection, record_id, data) select '00000000-0000-0000-0000-000000000000', 'orders', 'o9', '{}'$q$);
reset role;
