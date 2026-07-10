-- W2: the guard's plain SELECTs raced under concurrency — two concurrent
-- updates could each pass the checks and commit a chain or cycle. Lock the
-- rows involved so concurrent link updates serialize. Rules are unchanged
-- (self, chain, reverse-chain, cross-tenant).
create or replace function private.check_stock_source()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  source public.products%rowtype;
begin
  if new.stock_source_id is null then
    return new;
  end if;

  if new.stock_source_id = new.id then
    raise exception 'A product cannot use itself as its stock source';
  end if;

  -- Lock the source row before validating it, so a concurrent transaction
  -- cannot re-link the source (chain) or delete it while we check.
  select * into source
  from public.products
  where id = new.stock_source_id
  for update;

  if not found then
    raise exception 'Stock source product does not exist';
  end if;

  if source.tenant_id is distinct from new.tenant_id then
    raise exception 'Stock source must belong to the same tenant';
  end if;

  if source.stock_source_id is not null then
    raise exception 'Stock source is already linked to another product (chains are not allowed)';
  end if;

  -- Reverse chain: this product is someone else's pool, so it cannot link
  -- out. Lock the dependents too so a concurrent link to this product
  -- serializes against this check.
  perform 1 from public.products p
  where p.stock_source_id = new.id
  for update;

  if found then
    raise exception 'This product is a stock source for other products and cannot link to another pool';
  end if;

  return new;
end;
$$;