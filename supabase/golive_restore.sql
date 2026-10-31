-- =============================================================================
-- 997 Laundry — UNDO the go-live reset (puts back the data from the LATEST backup in backup_997)
-- Only if the reset removed something you need. Supabase → SQL Editor → paste ALL → Run.
-- Afterwards: on every device sign out, then "☁ الدخول من السحابة" to download the restored data.
-- =============================================================================
begin;
do $$
declare v_tag text; v_n int; v_cols text;
begin
  select substr(max(table_name), length('records_') + 1) into v_tag
    from information_schema.tables where table_schema = 'backup_997' and table_name like 'records_%';
  if v_tag is null then raise exception 'no backup found in backup_997 — nothing changed'; end if;

  -- staff logins and memberships (only ordinary columns: Supabase computes some login columns itself)
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into v_cols from information_schema.columns
   where table_schema = 'auth' and table_name = 'users' and is_generated = 'NEVER';
  execute format('insert into auth.users (%s) select %s from backup_997.%I b, jsonb_populate_record(null::auth.users, b.row) x on conflict do nothing',
                 v_cols, (select string_agg('x.' || c, ', ') from unnest(string_to_array(v_cols, ', ')) c), 'users_' || v_tag);
  if to_regclass(format('backup_997.%I', 'identities_' || v_tag)) is not null then
    select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into v_cols from information_schema.columns
     where table_schema = 'auth' and table_name = 'identities' and is_generated = 'NEVER';
    execute format('insert into auth.identities (%s) select %s from backup_997.%I b, jsonb_populate_record(null::auth.identities, b.row) x on conflict do nothing',
                   v_cols, (select string_agg('x.' || c, ', ') from unnest(string_to_array(v_cols, ', ')) c), 'identities_' || v_tag);
  end if;
  execute format('insert into public.shop_members select * from backup_997.%I on conflict do nothing', 'members_' || v_tag);

  -- records as they were (new change numbers so every device downloads them again)
  alter table public.records disable trigger user;
  execute format($q$
    update public.records r set data = b.data, deleted = b.deleted, version = r.version + 1, seq = nextval('public.records_seq'), updated_at = now()
      from backup_997.%I b
     where r.shop_id = b.shop_id and r.collection = b.collection and r.record_id = b.record_id
       and (r.data is distinct from b.data or r.deleted is distinct from b.deleted)$q$, 'records_' || v_tag);
  get diagnostics v_n = row_count;
  alter table public.records enable trigger user;
  execute format('insert into public.record_history (shop_id, collection, record_id, version, data, deleted, changed_at, changed_by) select shop_id, collection, record_id, version, data, deleted, changed_at, changed_by from backup_997.%I h where not exists (select 1 from public.record_history x where x.shop_id = h.shop_id and x.collection = h.collection and x.record_id = h.record_id and x.version = h.version)', 'history_' || v_tag);
  execute format('update public.shop_counters c set next_order = greatest(c.next_order, b.next_order) from backup_997.%I b where b.shop_id = c.shop_id', 'counters_' || v_tag);
  raise notice 'RESTORED from backup %: % records put back', v_tag, v_n;
end $$;
commit;
select (select count(*) from public.records where collection = 'orders' and not deleted) as orders,
       (select count(*) from public.shop_members) as accounts;
