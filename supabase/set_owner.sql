-- =============================================================================
-- 997 Laundry — name the owner account (run once in Supabase → SQL Editor, before linking from the app).
-- Replace OWNER_USERNAME with the owner's username in the system (English letters/digits), keep the rest.
-- Only this account can create the shop in the cloud; everyone else must be added by the owner.
-- =============================================================================
insert into public.shop_setup (id, owner_email) values (1, lower('OWNER_USERNAME') || '@997laundry.app')
on conflict (id) do update set owner_email = excluded.owner_email;
select owner_email from public.shop_setup;
