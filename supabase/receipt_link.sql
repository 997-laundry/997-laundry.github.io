-- 997 Laundry — receipt link for WhatsApp (run once in Supabase → SQL Editor; safe to run again)
-- The customer opens https://997-laundry.github.io/r.html?t=<token> and sees only that one receipt.
-- The token is random (22 characters) and created by the shop when the receipt is sent; nothing else is readable.
create index if not exists records_receipt_token on public.records ((data -> 'receiptPub' ->> 'token')) where collection = 'orders';
create or replace function public.public_receipt(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select r.data -> 'receiptPub' -> 'model'
  from public.records r
  where length(coalesce(p_token, '')) >= 20 and r.collection = 'orders' and not r.deleted
    and r.data -> 'receiptPub' ->> 'token' = p_token
  limit 1
$$;
revoke all on function public.public_receipt(text) from public;
grant execute on function public.public_receipt(text) to anon, authenticated;
