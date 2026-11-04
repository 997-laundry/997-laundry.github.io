-- 997 Laundry — security page: login sessions (active devices, remote sign-out). Run once in Supabase → SQL Editor (safe to run again).
insert into public.collection_rules (collection, read_roles, write_roles) values
  ('sessions', '{owner,manager,accountant,worker}', '{owner,manager,accountant,worker}')
on conflict (collection) do update set read_roles = excluded.read_roles, write_roles = excluded.write_roles;

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
  elsif p_collection = 'sessions' and not trusted then
    -- staff write only their own login sessions; a session ended or revoked by the owner/manager cannot be reopened
    if coalesce(n ->> 'uid', '') <> coalesce(auth.uid()::text, '-') then raise exception 'a session belongs to its own user'; end if;
    if o is not null and (o ->> 'revokedAt') is not null and (n ->> 'revokedAt') is distinct from (o ->> 'revokedAt') then raise exception 'a revoked session cannot be restored'; end if;
  end if;
end $$;
