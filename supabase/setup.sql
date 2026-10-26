-- =============================================================================
-- 997 Laundry — cloud database setup (Supabase / PostgreSQL)
-- Run ONCE in Supabase → SQL Editor → New query → paste → Run.
-- Safe to re-run: it only creates what is missing and refreshes rules/functions.
--
-- Design
--   * One shop. The first signed-in account creates it and becomes its owner;
--     nobody else can create a shop, and accounts that are not members see nothing.
--   * Every app record (order, customer, expense, ...) is one row in `records`,
--     grouped by `collection` (the app's storage key without the "l997_" prefix).
--   * Row Level Security decides, per role, which collections can be read/written.
--     Rules mirror the app's default permissions (worker / accountant / manager / owner).
--   * Nothing can be deleted through the API; audit entries cannot be edited;
--     every insert/update is copied to `record_history` (tamper-evident trail).
--   * `version` increases on every update so two devices cannot silently overwrite
--     each other (the app updates "where version = what I last saw").
--   * Order numbers are handed out by the server in blocks, so two devices never
--     print the same order number. Password hashes never leave the device.
-- =============================================================================

-- ---------- tables ----------
create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid()
);

create table if not exists public.shop_members (
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'accountant', 'worker')),
  display_name text not null default '' check (length(display_name) <= 120),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (shop_id, user_id)
);
create unique index if not exists shop_members_one_shop_per_user on public.shop_members (user_id);
alter table public.shop_members add column if not exists employee_id text;

create table if not exists public.shop_counters (
  shop_id uuid primary key references public.shops(id) on delete cascade,
  next_order bigint not null default 1
);

-- who is allowed to create the shop (set once by the owner in the SQL Editor — see supabase/set_owner.sql)
create table if not exists public.shop_setup (
  id int primary key default 1 check (id = 1),
  owner_email text not null
);

create table if not exists public.collection_rules (
  collection text primary key,
  read_roles text[] not null,
  write_roles text[] not null
);

create table if not exists public.records (
  shop_id uuid not null references public.shops(id) on delete cascade,
  collection text not null references public.collection_rules(collection),
  record_id text not null check (length(record_id) between 1 and 100),
  data jsonb not null check (pg_column_size(data) < 262144),
  deleted boolean not null default false,
  version bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (shop_id, collection, record_id)
);
create index if not exists records_changes on public.records (shop_id, updated_at);
-- change counter: devices pull "everything after change N" (no clock or tie problems)
create sequence if not exists public.records_seq;
alter table public.records add column if not exists seq bigint;
create index if not exists records_seq_idx on public.records (shop_id, seq);

create table if not exists public.record_history (
  id bigint generated always as identity primary key,
  shop_id uuid not null,
  collection text not null,
  record_id text not null,
  version bigint not null,
  data jsonb not null,
  deleted boolean not null,
  changed_at timestamptz not null default now(),
  changed_by uuid
);
create index if not exists record_history_lookup on public.record_history (shop_id, collection, record_id, version);

-- ---------- who may read / write each collection ----------
-- A = everyone in the shop, F = owner+manager+accountant, M = owner+manager, O = owner only
insert into public.collection_rules (collection, read_roles, write_roles) values
  ('orders',             '{owner,manager,accountant,worker}', '{owner,manager,accountant,worker}'),
  ('customers',          '{owner,manager,accountant,worker}', '{owner,manager,accountant,worker}'),
  ('ledger',             '{owner,manager,accountant,worker}', '{owner,manager,accountant,worker}'),
  ('customer_packages',  '{owner,manager,accountant,worker}', '{owner,manager,accountant,worker}'),
  ('suspended_orders',   '{owner,manager,accountant,worker}', '{owner,manager,accountant,worker}'),
  ('shifts',             '{owner,manager,accountant,worker}', '{owner,manager,accountant,worker}'),
  ('attendance',         '{owner,manager,accountant,worker}', '{owner,manager,accountant,worker}'),
  ('activity',           '{owner,manager,accountant,worker}', '{owner,manager,accountant,worker}'),
  ('audit',              '{owner,manager,accountant}',        '{owner,manager,accountant,worker}'),
  ('settings',           '{owner,manager,accountant,worker}', '{owner,manager}'),
  ('custom_garments',    '{owner,manager,accountant,worker}', '{owner,manager}'),
  ('profile',            '{owner,manager,accountant,worker}', '{owner,manager}'),
  ('branches',           '{owner,manager,accountant,worker}', '{owner,manager}'),
  ('perm_matrix',        '{owner,manager,accountant,worker}', '{owner,manager}'),
  ('security',           '{owner,manager,accountant,worker}', '{owner}'),
  ('employees',          '{owner,manager,accountant,worker}', '{owner,manager,accountant}'),
  ('payroll',            '{owner,manager,accountant}',        '{owner,manager,accountant}'),
  ('expenses',           '{owner,manager,accountant}',        '{owner,manager,accountant}'),
  ('recurring_expenses', '{owner,manager,accountant}',        '{owner,manager,accountant}'),
  ('inventory',          '{owner,manager,accountant}',        '{owner,manager,accountant}'),
  ('purchases',          '{owner,manager,accountant}',        '{owner,manager,accountant}'),
  ('suppliers',          '{owner,manager,accountant}',        '{owner,manager,accountant}'),
  ('stock_moves',        '{owner,manager,accountant}',        '{owner,manager,accountant}'),
  ('closures',           '{owner,manager,accountant}',        '{owner,manager}')
on conflict (collection) do update set read_roles = excluded.read_roles, write_roles = excluded.write_roles;

-- ---------- helpers ----------
-- role of the signed-in user in a shop (null = not an active member)
create or replace function public.member_role(p_shop uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from public.shop_members where shop_id = p_shop and user_id = auth.uid() and active
$$;

create or replace function public.can_access(p_shop uuid, p_collection text, p_write boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.collection_rules r
    where r.collection = p_collection
      and public.member_role(p_shop) = any (case when p_write then r.write_roles else r.read_roles end)
  )
$$;

-- first account creates the (single) shop and becomes its owner
create or replace function public.create_shop(p_name text, p_display_name text default '') returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if exists (select 1 from public.shops) then raise exception 'the shop already exists — ask the owner to add you'; end if;
  -- only the account named in shop_setup may create the shop (stops strangers claiming it before the owner links)
  if not exists (select 1 from public.shop_setup s join auth.users u on lower(u.email) = lower(s.owner_email) where u.id = auth.uid()) then
    raise exception 'not the shop owner account';
  end if;
  insert into public.shops (name, created_by) values (p_name, auth.uid()) returning id into v_id;
  insert into public.shop_members (shop_id, user_id, role, display_name) values (v_id, auth.uid(), 'owner', coalesce(p_display_name, ''));
  return v_id;
end $$;

-- hands out a block of order numbers that no other device will use (never below p_min)
create or replace function public.reserve_order_numbers(p_count int, p_min bigint default 1) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_shop uuid; v_first bigint;
begin
  select shop_id into v_shop from public.shop_members where user_id = auth.uid() and active;
  if v_shop is null then raise exception 'not a member of the shop'; end if;
  if p_count < 1 or p_count > 200 then raise exception 'count must be between 1 and 200'; end if;
  insert into public.shop_counters (shop_id, next_order) values (v_shop, greatest(coalesce(p_min, 1), 1))
    on conflict (shop_id) do nothing;
  update public.shop_counters set next_order = greatest(next_order, coalesce(p_min, 1)) + p_count
    where shop_id = v_shop returning next_order - p_count into v_first;
  return v_first;
end $$;

-- owner (anyone) / manager (accountants and workers only) sets a temporary password for a staff account
create or replace function public.set_member_password(p_user uuid, p_password text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_shop uuid; v_caller text; v_target text;
begin
  select shop_id, role into v_shop, v_caller from public.shop_members where user_id = auth.uid() and active;
  select role into v_target from public.shop_members where user_id = p_user and shop_id = v_shop;
  if v_shop is null or v_target is null then raise exception 'not allowed'; end if;
  if not (v_caller = 'owner' or (v_caller = 'manager' and v_target in ('accountant', 'worker'))) then
    raise exception 'not allowed';
  end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'password too short'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at = now()
    where id = p_user;
end $$;

-- add-only for collections a role may write but not read (e.g. workers and the audit log): inserting
-- through the API would also need read access to return the row, so these go through this function
create or replace function public.append_records(p_shop uuid, p_collection text, p_items jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; it jsonb;
begin
  if not public.can_access(p_shop, p_collection, true) then raise exception 'not allowed'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 200 then raise exception 'send 1 to 200 items'; end if;
  for it in select value from jsonb_array_elements(p_items) loop
    insert into public.records (shop_id, collection, record_id, data)
      values (p_shop, p_collection, it->>'id', it->'data') on conflict do nothing;
    if found then n := n + 1; end if;
  end loop;
  return n;
end $$;

-- ---------- financial integrity rules (server side — cannot be bypassed from a device) ----------
-- Workers and accountants cannot rewrite financial history; owner and manager can (and every change is
-- kept in record_history). Corrections are made with new entries (reversals, refunds, adjustments).
create or replace function public.jdiff(a jsonb, b jsonb, keys text[]) returns boolean
language sql immutable as $$
  select exists (select 1 from unnest(keys) k where (a -> k) is distinct from (b -> k))
$$;

create or replace function public.business_rules(p_role text, p_collection text, o jsonb, n jsonb) returns void
language plpgsql stable set search_path = public as $$
declare trusted boolean := p_role in ('owner', 'manager');
begin
  if p_collection = 'ledger' then
    -- a recorded transaction is a fact: amount/type/customer/method/time never change (a reversal is a new entry)
    if o is not null and jdiff(o, n, array['amount', 'type', 'customerId', 'method', 'at', 'orderId']) then
      raise exception 'ledger entries cannot be changed — record a reversal instead';
    end if;
    if o is not null and p_role = 'worker' then raise exception 'workers cannot change ledger entries'; end if;
  elsif p_collection = 'orders' and not trusted then
    if o is null then
      if coalesce((n ->> 'paymentConfirmed')::boolean, false) then raise exception 'a new order cannot start as paid'; end if;
      return;
    end if;
    if o ->> 'status' = 'cancelled' and o is distinct from n then raise exception 'a cancelled order cannot be changed'; end if;
    if o ->> 'status' = 'delivered' and coalesce(n ->> 'status', '') <> 'delivered' then raise exception 'only the owner or a manager can undo a delivery'; end if;
    if not ((coalesce(o ->> 'status', 'received'), coalesce(n ->> 'status', 'received')) in (('received','received'), ('received','ready'), ('received','cancelled'),
            ('ready','ready'), ('ready','delivered'), ('ready','cancelled'), ('delivered','delivered'))) then
      raise exception 'order status cannot move from % to %', coalesce(o ->> 'status', 'received'), coalesce(n ->> 'status', 'received');
    end if;
    if coalesce((o ->> 'paymentConfirmed')::boolean, false) then
      if not coalesce((n ->> 'paymentConfirmed')::boolean, false) then raise exception 'a confirmed payment cannot be undone'; end if;
      if jdiff(o -> 'payment', n -> 'payment', array['total', 'paid', 'method', 'balanceUse', 'discount']) or (o -> 'items') is distinct from (n -> 'items') then
        raise exception 'a paid order''s amounts and items cannot be changed';
      end if;
    end if;
  elsif p_collection = 'expenses' and o is not null and not trusted then
    if jdiff(o, n, array['amount', 'method', 'catId', 'category', 'date']) then raise exception 'an expense amount cannot be changed — void it and record a new one'; end if;
    if coalesce((o ->> 'voided')::boolean, false) and not coalesce((n ->> 'voided')::boolean, false) then raise exception 'a voided expense cannot be restored'; end if;
  elsif p_collection in ('closures', 'payroll') and o is not null and p_role <> 'owner' then
    raise exception 'closings and payroll entries are final';
  elsif p_collection = 'customers' and p_role = 'worker' then
    if coalesce((n ->> 'openingBalance')::numeric, 0) <> coalesce((o ->> 'openingBalance')::numeric, 0) then
      raise exception 'workers cannot set opening balances';
    end if;
  elsif p_collection = 'customer_packages' and p_role = 'worker' and o is not null then
    if jdiff(o, n, array['totalPieces', 'price', 'customerId', 'purchasedAt']) then raise exception 'workers cannot change a sold package'; end if;
  end if;
end $$;

-- ---------- record rules enforced on the server ----------
create or replace function public.records_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  new.seq := nextval('public.records_seq');
  if tg_op = 'INSERT' then
    new.version := 1;
    new.deleted := false;
    perform public.business_rules(public.member_role(new.shop_id), new.collection, null, new.data);
    -- one payment / refund entry per order: two devices confirming or cancelling the same order cannot post it twice
    if new.collection = 'ledger' and new.data ->> 'orderId' is not null and not coalesce((new.data ->> 'settles')::boolean, false)
       and new.data ->> 'type' in ('order_charge', 'order_refund', 'credit')
       and exists (select 1 from public.records r
                   where r.shop_id = new.shop_id and r.collection = 'ledger' and not r.deleted and r.record_id <> new.record_id
                     and r.data ->> 'orderId' = new.data ->> 'orderId' and r.data ->> 'type' = new.data ->> 'type'
                     and coalesce(r.data ->> 'method', '') = coalesce(new.data ->> 'method', '')
                     and not coalesce((r.data ->> 'settles')::boolean, false)) then
      raise exception 'this order''s payment was already recorded on another device';
    end if;
    return new;
  end if;
  if new.shop_id <> old.shop_id or new.collection <> old.collection or new.record_id <> old.record_id then
    raise exception 'records cannot be moved';
  end if;
  if old.collection = 'audit' then raise exception 'audit entries cannot be changed'; end if;
  -- core business records can only be removed by the owner or a manager (others: anyone who may write them)
  if new.deleted and not old.deleted
     and old.collection in ('orders', 'customers', 'ledger', 'customer_packages', 'closures', 'payroll')
     and public.member_role(old.shop_id) not in ('owner', 'manager') then
    raise exception 'only the owner or a manager can remove records';
  end if;
  if new.data is distinct from old.data then
    perform public.business_rules(public.member_role(old.shop_id), old.collection, old.data, new.data);
  end if;
  new.version := old.version + 1;
  return new;
end $$;

create or replace function public.records_history() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.record_history (shop_id, collection, record_id, version, data, deleted, changed_by)
  values (new.shop_id, new.collection, new.record_id, new.version, new.data, new.deleted, new.updated_by);
  return null;
end $$;

drop trigger if exists records_guard on public.records;
create trigger records_guard before insert or update on public.records for each row execute function public.records_guard();
drop trigger if exists records_history on public.records;
create trigger records_history after insert or update on public.records for each row execute function public.records_history();

-- membership rules: cannot remove / demote / deactivate the last active owner
create or replace function public.members_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.role = 'owner' and old.active and (new.role <> 'owner' or not new.active)
     and not exists (select 1 from public.shop_members m where m.shop_id = old.shop_id and m.role = 'owner' and m.active and m.user_id <> old.user_id) then
    raise exception 'the shop must keep at least one active owner';
  end if;
  if tg_op = 'UPDATE' and (new.shop_id <> old.shop_id or new.user_id <> old.user_id) then
    raise exception 'membership cannot be moved';
  end if;
  return new;
end $$;
drop trigger if exists members_guard on public.shop_members;
create trigger members_guard before update on public.shop_members for each row execute function public.members_guard();

-- ---------- Row Level Security ----------
alter table public.shops enable row level security;
alter table public.shop_members enable row level security;
alter table public.collection_rules enable row level security;
alter table public.records enable row level security;
alter table public.record_history enable row level security;
alter table public.shop_counters enable row level security;
alter table public.shop_setup enable row level security; -- no policies: only the SQL Editor (admin) can see or change it -- no policies: only reserve_order_numbers() touches it

drop policy if exists shops_read on public.shops;
create policy shops_read on public.shops for select to authenticated using (public.member_role(id) is not null);
drop policy if exists shops_rename on public.shops;
create policy shops_rename on public.shops for update to authenticated using (public.member_role(id) = 'owner') with check (public.member_role(id) = 'owner');

drop policy if exists members_read on public.shop_members;
create policy members_read on public.shop_members for select to authenticated using (public.member_role(shop_id) is not null);
-- owner manages everyone; a manager manages accountants and workers only (same rank rule as the app)
drop policy if exists members_add on public.shop_members;
create policy members_add on public.shop_members for insert to authenticated with check (
  public.member_role(shop_id) = 'owner' or (public.member_role(shop_id) = 'manager' and role in ('accountant', 'worker')));
drop policy if exists members_change on public.shop_members;
create policy members_change on public.shop_members for update to authenticated
  using (public.member_role(shop_id) = 'owner' or (public.member_role(shop_id) = 'manager' and role in ('accountant', 'worker')))
  with check (public.member_role(shop_id) = 'owner' or (public.member_role(shop_id) = 'manager' and role in ('accountant', 'worker')));

drop policy if exists rules_read on public.collection_rules;
create policy rules_read on public.collection_rules for select to authenticated using (true);

drop policy if exists records_read on public.records;
create policy records_read on public.records for select to authenticated using (public.can_access(shop_id, collection, false));
drop policy if exists records_add on public.records;
create policy records_add on public.records for insert to authenticated with check (public.can_access(shop_id, collection, true));
drop policy if exists records_change on public.records;
create policy records_change on public.records for update to authenticated
  using (public.can_access(shop_id, collection, true)) with check (public.can_access(shop_id, collection, true));
-- no delete policy: deleting through the API is impossible

drop policy if exists history_read on public.record_history;
create policy history_read on public.record_history for select to authenticated
  using (public.member_role(shop_id) in ('owner', 'manager', 'accountant'));

-- ---------- privileges (TRUNCATE/DELETE bypass or skip RLS checks, so they are removed) ----------
revoke all on public.shops, public.shop_members, public.collection_rules, public.records, public.record_history, public.shop_counters, public.shop_setup from anon, authenticated;
grant select, update on public.shops to authenticated;
grant select, insert, update on public.shop_members to authenticated;
grant select on public.collection_rules to authenticated;
grant select, insert, update on public.records to authenticated;
grant select on public.record_history to authenticated;
revoke all on function public.create_shop(text, text) from public, anon;
grant execute on function public.create_shop(text, text) to authenticated;
revoke all on function public.reserve_order_numbers(int, bigint), public.set_member_password(uuid, text), public.append_records(uuid, text, jsonb) from public, anon;
grant execute on function public.reserve_order_numbers(int, bigint), public.set_member_password(uuid, text), public.append_records(uuid, text, jsonb) to authenticated;
revoke all on function public.member_role(uuid), public.can_access(uuid, text, boolean) from public, anon;
grant execute on function public.member_role(uuid), public.can_access(uuid, text, boolean) to authenticated;
revoke all on function public.records_guard(), public.records_history(), public.members_guard() from public, anon, authenticated;
revoke all on function public.business_rules(text, text, jsonb, jsonb) from public, anon, authenticated;
