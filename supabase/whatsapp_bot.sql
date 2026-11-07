-- 997 Laundry — WhatsApp AI assistant: conversations (also appended to setup.sql for new installs).
-- Run once in Supabase → SQL Editor. Safe to run again.
-- Messages are written only by the whatsapp-bot Edge Function (service role). Shop members can read them and
-- take over / hand back a conversation (mode, waiting, unread). Nobody can delete through the API.

create table if not exists public.wa_threads (
  shop_id uuid not null references public.shops(id) on delete cascade,
  phone text not null check (phone ~ '^[0-9]{8,15}$'),
  name text,
  customer_id text,
  mode text not null default 'bot' check (mode in ('bot', 'human')),
  waiting boolean not null default false,       -- the customer asked for a person / left a message
  flag text,                                    -- 'human' | 'callback' | 'complaint' | 'pickup' | 'media'
  unread int not null default 0,
  last_text text,
  last_at timestamptz not null default now(),
  human_at timestamptz,
  primary key (shop_id, phone)
);
create index if not exists wa_threads_recent on public.wa_threads (shop_id, last_at desc);

create table if not exists public.wa_messages (
  id bigint generated always as identity primary key,
  shop_id uuid not null references public.shops(id) on delete cascade,
  phone text not null,
  dir text not null check (dir in ('in', 'out', 'note')),
  who text,                                     -- 'customer' | 'bot' | staff name | 'system'
  body text not null check (length(body) <= 4096),
  wa_id text unique,                            -- WhatsApp message id (duplicates from Meta are ignored)
  at timestamptz not null default now()
);
create index if not exists wa_messages_thread on public.wa_messages (shop_id, phone, at desc);

alter table public.wa_threads enable row level security;
alter table public.wa_messages enable row level security;
drop policy if exists wa_threads_read on public.wa_threads;
create policy wa_threads_read on public.wa_threads for select to authenticated using (public.member_role(shop_id) is not null);
drop policy if exists wa_threads_change on public.wa_threads;
create policy wa_threads_change on public.wa_threads for update to authenticated
  using (public.member_role(shop_id) is not null) with check (public.member_role(shop_id) is not null);
drop policy if exists wa_messages_read on public.wa_messages;
create policy wa_messages_read on public.wa_messages for select to authenticated using (public.member_role(shop_id) is not null);

revoke all on public.wa_threads, public.wa_messages from anon, authenticated;
grant select on public.wa_threads, public.wa_messages to authenticated;
grant update (mode, waiting, flag, unread, human_at) on public.wa_threads to authenticated;
-- the whatsapp-bot function writes with the service role (explicit, in case default privileges were changed)
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update on public.wa_threads, public.wa_messages to service_role;
    -- the functions also check membership, read the shop's data and file pickup requests / new customers
    grant select on public.shops, public.shop_members to service_role;
    grant select, insert on public.records to service_role;
    grant usage, select on all sequences in schema public to service_role;
  end if;
end $$;
